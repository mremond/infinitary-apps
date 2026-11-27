#import "PhoneKeyExceptions.h"
#import <objc/message.h>
#import <objc/runtime.h>

NSString *PhoneCatchKeyException(void (^action)(void)) {
    @try {
        action();
        return nil;
    } @catch (NSException *exception) {
        return [NSString stringWithFormat:@"%@: %@", exception.name, exception.reason ?: @"No reason supplied"];
    }
}

static BOOL PhoneKeyMethodMatches(id receiver, SEL selector, NSString *expected) {
    Method method = class_getInstanceMethod(object_getClass(receiver), selector);
    if (!method) return NO;
    const char *encoding = method_getTypeEncoding(method);
    NSMutableString *signature = [NSMutableString string];
    // Stack offsets vary by architecture; the argument and result types must not.
    for (const char *part = encoding; *part; part++) {
        if (*part < '0' || *part > '9') [signature appendFormat:@"%c", *part];
    }
    return [signature isEqualToString:expected];
}

NSString *PhoneWaitForKeyQuiescence(id application) {
    SEL current = NSSelectorFromString(@"currentProcess");
    if (!PhoneKeyMethodMatches(application, current, @"@@:"))
        return @"XCTest's currentProcess getter is missing or has an incompatible signature";
    __block id process = nil;
    NSString *failure = PhoneCatchKeyException(^{
        process = ((id (*)(id, SEL))objc_msgSend)(application, current);
    });
    if (failure) return failure;
    SEL wait = NSSelectorFromString(@"waitForQuiescenceIncludingAnimationsIdle:usingActivity:isPreEvent:");
    if (!process || !PhoneKeyMethodMatches(process, wait, @"v@:BBB"))
        return @"XCTest's main-run-loop quiescence wait is missing or has an incompatible signature";
    // A fresh run-loop wait drains the pushed page's pending work without waiting for its animations.
    return PhoneCatchKeyException(^{
        ((void (*)(id, SEL, BOOL, BOOL, BOOL))objc_msgSend)(process, wait, NO, YES, NO);
    });
}
