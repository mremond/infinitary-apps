var PhoneSettingsWords = (function(exports) {
  "use strict";
  const SOURCE_LANGUAGE = "en";
  const PSEUDO_LANGUAGES = ["en-XA", "ar-XB"];
  function isPseudoLanguage(tag) {
    return PSEUDO_LANGUAGES.includes(tag);
  }
  function languageFormatTag(tag) {
    if (tag === SOURCE_LANGUAGE) return "en-US";
    if (isPseudoLanguage(tag)) return tag.slice(0, 2);
    return tag;
  }
  let language$1 = SOURCE_LANGUAGE;
  function currentLanguage() {
    return language$1;
  }
  const listeners = /* @__PURE__ */ new Set();
  function setCurrentLanguage(tag) {
    if (tag === language$1) return;
    language$1 = tag;
    for (const listener of listeners) listener(tag);
  }
  function languageLocale() {
    return languageFormatTag(language$1);
  }
  let computerLocale;
  function regionalLocale(tag = language$1) {
    return tag === SOURCE_LANGUAGE ? computerLocale : languageFormatTag(tag);
  }
  function getEnumValues(entries) {
    const numericValues = Object.values(entries).filter((v) => typeof v === "number");
    const values = Object.entries(entries).filter(([k, _]) => numericValues.indexOf(+k) === -1).map(([_, v]) => v);
    return values;
  }
  function joinValues(array2, separator = "|") {
    return array2.map((val) => stringifyPrimitive(val)).join(separator);
  }
  function jsonStringifyReplacer(_, value) {
    if (typeof value === "bigint")
      return value.toString();
    return value;
  }
  class Cached {
    constructor(getter) {
      this._getter = getter;
      this._value = void 0;
    }
    get value() {
      const getter = this._getter;
      if (getter !== void 0) {
        this._value = getter();
        this._getter = void 0;
      }
      return this._value;
    }
  }
  function cached(getter) {
    return new Cached(getter);
  }
  function nullish(input) {
    return input === null || input === void 0;
  }
  function cleanRegex(source) {
    const start = source.startsWith("^") ? 1 : 0;
    const end = source.endsWith("$") ? source.length - 1 : source.length;
    return source.slice(start, end);
  }
  function floatSafeRemainder(val, step) {
    const ratio = val / step;
    const roundedRatio = Math.round(ratio);
    const tolerance = 4 * Number.EPSILON * Math.max(Math.abs(ratio), 1);
    if (Math.abs(ratio - roundedRatio) < tolerance)
      return 0;
    return ratio - roundedRatio;
  }
  function assignProp(target, prop, value) {
    Object.defineProperty(target, prop, {
      value,
      writable: true,
      enumerable: true,
      configurable: true
    });
  }
  function rawShape(def) {
    const desc = Object.getOwnPropertyDescriptor(def, "shape");
    return desc?.get ? desc.get.raw : desc?.value;
  }
  function sourceShape(schema) {
    return rawShape(schema._zod.def) ?? schema._zod.def.shape;
  }
  function deferProp(target, key, getter) {
    Object.defineProperty(target, key, {
      get() {
        const value = getter();
        assignProp(this, key, value);
        return value;
      },
      enumerable: true,
      configurable: true
    });
  }
  function putProp(target, key, value) {
    if (key in target)
      assignProp(target, key, value);
    else
      target[key] = value;
  }
  function mirrorShape(target, source, keys, wrap) {
    const raw = sourceShape(source);
    for (const key of keys) {
      const desc = Object.getOwnPropertyDescriptor(raw, key);
      if (!desc.enumerable)
        continue;
      if (desc.get) {
        deferProp(target, key, () => {
          const value = source._zod.def.shape[key];
          return wrap ? wrap(value, key) : value;
        });
      } else
        putProp(target, key, wrap ? wrap(desc.value, key) : desc.value);
    }
  }
  function mirrorProps(target, source) {
    for (const key of Reflect.ownKeys(source)) {
      const desc = Object.getOwnPropertyDescriptor(source, key);
      if (!desc.enumerable)
        continue;
      if (desc.get)
        deferProp(target, key, () => source[key]);
      else
        putProp(target, key, desc.value);
    }
  }
  function mergeDefs(...defs) {
    const mergedDescriptors = {};
    for (const def of defs) {
      const descriptors = Object.getOwnPropertyDescriptors(def);
      Object.assign(mergedDescriptors, descriptors);
    }
    return Object.defineProperties({}, mergedDescriptors);
  }
  function esc(str) {
    return JSON.stringify(str);
  }
  function slugify(input) {
    return input.toLowerCase().trim().replace(/[^\w\s-]/g, "").replace(/[\s_-]+/g, "-").replace(/^-+|-+$/g, "");
  }
  const captureStackTrace = "captureStackTrace" in Error ? Error.captureStackTrace : (..._args) => {
  };
  function isObject(data) {
    return typeof data === "object" && data !== null && !Array.isArray(data);
  }
  const allowsEval = /* @__PURE__ */ cached(() => {
    if (globalConfig.jitless) {
      return false;
    }
    if (typeof navigator !== "undefined" && navigator?.userAgent?.includes("Cloudflare")) {
      return false;
    }
    try {
      const F = Function;
      new F("");
      return true;
    } catch (_) {
      return false;
    }
  });
  function isPlainObject(o) {
    if (isObject(o) === false)
      return false;
    const ctor = o.constructor;
    if (ctor === void 0)
      return true;
    if (typeof ctor !== "function")
      return true;
    const prot = ctor.prototype;
    if (isObject(prot) === false)
      return false;
    if (Object.prototype.hasOwnProperty.call(prot, "isPrototypeOf") === false) {
      return false;
    }
    return true;
  }
  function shallowClone(o) {
    if (isPlainObject(o))
      return { ...o };
    if (Array.isArray(o))
      return [...o];
    if (o instanceof Map)
      return new Map(o);
    if (o instanceof Set)
      return new Set(o);
    return o;
  }
  const propertyKeyTypes = /* @__PURE__ */ new Set(["string", "number", "symbol"]);
  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  function clone(inst, def, params) {
    const cl = new inst._zod.constr(def ?? inst._zod.def);
    if (!def || params?.parent)
      cl._zod.parent = inst;
    return cl;
  }
  function normalizeParams(_params) {
    const params = _params;
    if (!params)
      return {};
    if (typeof params === "string")
      return { error: () => params };
    if (params?.message !== void 0) {
      if (params?.error !== void 0)
        throw new Error("Cannot specify both `message` and `error` params");
      params.error = params.message;
    }
    delete params.message;
    if (typeof params.error === "string")
      return { ...params, error: () => params.error };
    return params;
  }
  function stringifyPrimitive(value) {
    if (typeof value === "bigint")
      return value.toString() + "n";
    if (typeof value === "string")
      return `"${value}"`;
    return `${value}`;
  }
  function optionalKeys(shape) {
    return Object.keys(shape).filter((k) => {
      return shape[k]._zod.optin !== void 0 && shape[k]._zod.optout === "optional";
    });
  }
  const NUMBER_FORMAT_RANGES = /* @__PURE__ */ (() => ({
    safeint: [Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
    int32: [-2147483648, 2147483647],
    uint32: [0, 4294967295],
    float32: [-34028234663852886e22, 34028234663852886e22],
    float64: [-Number.MAX_VALUE, Number.MAX_VALUE]
  }))();
  const BIGINT_FORMAT_RANGES = {
    int64: [/* @__PURE__ */ BigInt("-9223372036854775808"), /* @__PURE__ */ BigInt("9223372036854775807")],
    uint64: [/* @__PURE__ */ BigInt(0), /* @__PURE__ */ BigInt("18446744073709551615")]
  };
  function pick(schema, mask) {
    const currDef = schema._zod.def;
    const checks = currDef.checks;
    const hasChecks = checks && checks.length > 0;
    if (hasChecks) {
      throw new Error(".pick() cannot be used on object schemas containing refinements");
    }
    const newShape = {};
    mirrorShape(newShape, schema, maskedKeys(schema, mask));
    return clone(schema, mergeDefs(currDef, { shape: newShape, checks: [] }));
  }
  function maskedKeys(schema, mask) {
    const raw = sourceShape(schema);
    const keys = [];
    for (const key of Reflect.ownKeys(mask)) {
      if (!Object.getOwnPropertyDescriptor(raw, key)?.enumerable) {
        throw new Error(`Unrecognized key: "${String(key)}"`);
      }
      if (mask[key])
        keys.push(key);
    }
    return keys;
  }
  function omit(schema, mask) {
    const currDef = schema._zod.def;
    const checks = currDef.checks;
    const hasChecks = checks && checks.length > 0;
    if (hasChecks) {
      throw new Error(".omit() cannot be used on object schemas containing refinements");
    }
    const omitted = new Set(maskedKeys(schema, mask));
    const newShape = {};
    mirrorShape(newShape, schema, Reflect.ownKeys(sourceShape(schema)).filter((key) => !omitted.has(key)));
    return clone(schema, mergeDefs(currDef, { shape: newShape, checks: [] }));
  }
  function extend(schema, shape) {
    if (!isPlainObject(shape)) {
      throw new Error("Invalid input to extend: expected a plain object");
    }
    const checks = schema._zod.def.checks;
    const hasChecks = checks && checks.length > 0;
    if (hasChecks) {
      const existingShape = sourceShape(schema);
      for (const key of Reflect.ownKeys(shape)) {
        if (Object.getOwnPropertyDescriptor(existingShape, key) !== void 0) {
          throw new Error("Cannot overwrite keys on object schemas containing refinements. Use `.safeExtend()` instead.");
        }
      }
    }
    return clone(schema, mergeDefs(schema._zod.def, { shape: extended(schema, shape) }));
  }
  function extended(schema, shape) {
    const newShape = {};
    mirrorShape(newShape, schema, Reflect.ownKeys(sourceShape(schema)));
    mirrorProps(newShape, shape);
    return newShape;
  }
  function safeExtend(schema, shape) {
    if (!isPlainObject(shape)) {
      throw new Error("Invalid input to safeExtend: expected a plain object");
    }
    return clone(schema, mergeDefs(schema._zod.def, { shape: extended(schema, shape) }));
  }
  function merge(a, b) {
    if (!b?._zod?.def) {
      throw new Error("Invalid input to merge: expected an object schema. To merge a plain shape, use `.extend()`.");
    }
    if (a._zod.def.checks?.length) {
      throw new Error(".merge() cannot be used on object schemas containing refinements. Use .safeExtend() instead.");
    }
    const newShape = {};
    mirrorShape(newShape, a, Reflect.ownKeys(sourceShape(a)));
    mirrorShape(newShape, b, Reflect.ownKeys(sourceShape(b)));
    const def = mergeDefs(a._zod.def, {
      shape: newShape,
      get catchall() {
        return b._zod.def.catchall;
      },
      checks: b._zod.def.checks ?? []
    });
    return clone(a, def);
  }
  function partial(Class, schema, mask, name = "partial") {
    const currDef = schema._zod.def;
    const checks = currDef.checks;
    const hasChecks = checks && checks.length > 0;
    if (hasChecks) {
      throw new Error(`.${name}() cannot be used on object schemas containing refinements`);
    }
    const selected = mask ? new Set(maskedKeys(schema, mask)) : void 0;
    const newShape = {};
    mirrorShape(newShape, schema, Reflect.ownKeys(sourceShape(schema)), Class && ((value, key) => selected && !selected.has(key) ? value : new Class({ type: "optional", innerType: value })));
    return clone(schema, mergeDefs(schema._zod.def, { shape: newShape, checks: [] }));
  }
  function required(Class, schema, mask) {
    const selected = mask ? new Set(maskedKeys(schema, mask)) : void 0;
    const newShape = {};
    mirrorShape(newShape, schema, Reflect.ownKeys(sourceShape(schema)), (value, key) => (
      // overwrite with non-optional
      selected && !selected.has(key) ? value : new Class({ type: "nonoptional", innerType: value })
    ));
    return clone(schema, mergeDefs(schema._zod.def, { shape: newShape }));
  }
  function aborted(x, startIndex = 0) {
    if (x.aborted === true)
      return true;
    for (let i = startIndex; i < x.issues.length; i++) {
      if (x.issues[i]?.continue !== true) {
        return true;
      }
    }
    return false;
  }
  function explicitlyAborted(x, startIndex = 0) {
    if (x.aborted === true)
      return true;
    for (let i = startIndex; i < x.issues.length; i++) {
      if (x.issues[i]?.continue === false) {
        return true;
      }
    }
    return false;
  }
  function prefixIssues(path, issues) {
    return issues.map((iss) => {
      var _a2;
      (_a2 = iss).path ?? (_a2.path = []);
      iss.path.unshift(path);
      return iss;
    });
  }
  function unwrapMessage(message) {
    return typeof message === "string" ? message : message?.message;
  }
  function sizeCaps(defChecks) {
    const caps = [];
    for (const ch of defChecks ?? []) {
      const d = ch._zod.def;
      if (!/_(length|size)$|_equals$/.test(d.check))
        break;
      const max = d.maximum ?? d.length ?? d.size;
      if (max >= 0)
        caps.push([max, ch]);
    }
    return caps;
  }
  function attachSchema(issues, start, inst) {
    var _a2;
    for (let i = start; i < issues.length; i++) {
      (_a2 = issues[i]).schema ?? (_a2.schema = inst);
    }
  }
  function finalizeIssue(iss, ctx, config2) {
    var _a2;
    const traits = iss.inst?._zod?.traits;
    if (traits?.has("$ZodType")) {
      if (traits.has("$ZodCheck"))
        (_a2 = iss).schema ?? (_a2.schema = iss.inst);
      else
        iss.schema = iss.inst;
    }
    const schemaError = iss.schema !== iss.inst ? iss.schema?._zod.def?.error : void 0;
    const message = iss.message ? iss.message : unwrapMessage(iss.inst?._zod.def?.error?.(iss)) ?? unwrapMessage(schemaError?.(iss)) ?? unwrapMessage(ctx?.error?.(iss)) ?? unwrapMessage(config2.customError?.(iss)) ?? unwrapMessage(config2.localeError?.(iss)) ?? "Invalid input";
    const full = {};
    for (const k of Object.keys(iss)) {
      if (k === "inst" || k === "schema" || k === "continue" || k === "input" || k === "__proto__")
        continue;
      full[k] = iss[k];
    }
    full.path ?? (full.path = []);
    full.message = message;
    if (ctx?.reportInput) {
      full.input = iss.input;
    }
    return full;
  }
  const highSurrogate = /[\uD800-\uDBFF]/;
  function codePointLength(str) {
    const units = str.length;
    if (!highSurrogate.test(str))
      return units;
    let count = units;
    for (let i = 0; i < units - 1; i++) {
      if ((str.charCodeAt(i) & 64512) === 55296 && (str.charCodeAt(i + 1) & 64512) === 56320) {
        count--;
        i++;
      }
    }
    return count;
  }
  function getLengthableOrigin(input) {
    if (Array.isArray(input))
      return "array";
    if (typeof input === "string")
      return "string";
    return "unknown";
  }
  function parsedType(data) {
    const t = typeof data;
    switch (t) {
      case "number": {
        return Number.isNaN(data) ? "nan" : "number";
      }
      case "object": {
        if (data === null) {
          return "null";
        }
        if (Array.isArray(data)) {
          return "array";
        }
        const obj = data;
        if (obj && Object.getPrototypeOf(obj) !== Object.prototype && "constructor" in obj && obj.constructor) {
          return obj.constructor.name;
        }
      }
    }
    return t;
  }
  function issue(...args) {
    const [iss, input, inst] = args;
    if (typeof iss === "string") {
      return {
        message: iss,
        code: "custom",
        input,
        inst
      };
    }
    return { ...iss };
  }
  function members(proto, table) {
    for (const key in table) {
      const desc = Object.getOwnPropertyDescriptor(table, key);
      if (desc.get)
        Object.defineProperty(proto, key, { ...desc, enumerable: false });
      else
        defineBound(proto, key, desc.value);
    }
  }
  function own(inst, key, value, enumerable = true) {
    Object.defineProperty(inst, key, { configurable: true, writable: true, enumerable, value });
    return value;
  }
  function hide(inst, key, value) {
    return own(inst, key, value, false);
  }
  function derived(computes, table) {
    for (const key in computes) {
      const compute = computes[key];
      Object.defineProperty(table, key, {
        configurable: true,
        enumerable: true,
        get() {
          return own(this, key, compute(this));
        },
        set(value) {
          own(this, key, value);
        }
      });
    }
    return table;
  }
  function defineBound(proto, key, fn) {
    Object.defineProperty(proto, key, {
      configurable: true,
      get() {
        return this == null ? fn : own(this, key, fn.bind(this));
      },
      set(value) {
        own(this, key, value);
      }
    });
  }
  function claim(inst, sentinel) {
    const proto = Object.getPrototypeOf(inst);
    return sentinel in proto ? void 0 : proto;
  }
  let installing;
  let broke = false;
  const breaker = {
    configurable: true,
    get() {
      broke = true;
      return void 0;
    }
  };
  function defineLazyInternal(inst, key, compute) {
    const proto = Object.getPrototypeOf(inst._zod);
    if (key in proto && installing !== inst._zod) {
      installing = void 0;
      return;
    }
    installing = inst._zod;
    Object.defineProperty(proto, key, {
      configurable: true,
      get() {
        Object.defineProperty(this, key, breaker);
        const outer = broke;
        broke = false;
        try {
          const value = compute(this);
          if (broke)
            delete this[key];
          else
            Object.defineProperty(this, key, { configurable: true, writable: true, value });
          broke = broke || outer;
          return value;
        } catch (err) {
          delete this[key];
          broke = broke || outer;
          throw err;
        }
      },
      set(value) {
        Object.defineProperty(this, key, { configurable: true, writable: true, value });
      }
    });
  }
  function installLazyProp(inst, key, make, enumerable) {
    const proto = claim(inst, key);
    if (!proto)
      return;
    Object.defineProperty(proto, key, {
      configurable: true,
      get() {
        const desc = { configurable: true, writable: true, enumerable, value: void 0 };
        Object.defineProperty(this, key, desc);
        desc.value = make(this);
        Object.defineProperty(this, key, desc);
        return desc.value;
      },
      set(value) {
        Object.defineProperty(this, key, { configurable: true, writable: true, enumerable, value });
      }
    });
  }
  const CONSTANT_CATCH = "~constantCatch";
  function constantCatch(value) {
    const fn = () => value;
    fn[CONSTANT_CATCH] = true;
    return fn;
  }
  var _a$1;
  const _zodDesc = { value: void 0, enumerable: false };
  let _E = "captureStackTrace" in Error ? Error : null;
  function newError(Definition) {
    const E = _E;
    if (E) {
      const saved = E.stackTraceLimit;
      if (typeof saved === "number") {
        try {
          E.stackTraceLimit = 0;
        } catch {
          _E = null;
          return new Definition();
        }
        try {
          return new Definition();
        } finally {
          E.stackTraceLimit = saved;
        }
      }
    }
    return new Definition();
  }
  function $constructor(name, initializer2, proto, params) {
    const zodProto = {};
    function Internals(def) {
      this.def = def;
      this.constr = _;
      this.traits = /* @__PURE__ */ new Set();
    }
    Internals.prototype = zodProto;
    const protoMembers = proto;
    const initialized = protoMembers && /* @__PURE__ */ new WeakSet();
    function init(inst, def) {
      if (!inst._zod) {
        _zodDesc.value = new Internals(def);
        try {
          Object.defineProperty(inst, "_zod", _zodDesc);
        } finally {
          _zodDesc.value = void 0;
        }
      } else if (inst._zod.traits.has(name)) {
        return;
      }
      inst._zod.traits.add(name);
      initializer2(inst, def);
      if (initialized) {
        const own2 = Object.getPrototypeOf(inst);
        const ctorProto = inst._zod.constr.prototype;
        let up = own2;
        while (up && up !== ctorProto)
          up = Object.getPrototypeOf(up);
        const target = up ?? own2;
        if (!initialized.has(target)) {
          initialized.add(target);
          members(target, protoMembers);
        }
      }
      const proto2 = _.prototype;
      for (const k in proto2) {
        if (!Object.prototype.hasOwnProperty.call(proto2, k))
          continue;
        if (!(k in inst)) {
          inst[k] = proto2[k].bind(inst);
        }
      }
    }
    const Parent = params?.Parent ?? Object;
    class Definition extends Parent {
    }
    Object.defineProperty(Definition, "name", { value: name });
    function _(def) {
      const inst = params?.Parent ? newError(Definition) : this;
      init(inst, def);
      const deferred = inst._zod.deferred;
      if (deferred) {
        for (const fn of deferred) {
          fn();
        }
        inst._zod.deferred = void 0;
      }
      const pp = globalThis.__zod_globalConfig?.postProcessor;
      if (pp)
        pp(inst);
      return inst;
    }
    Object.defineProperty(_, "init", { value: init });
    Object.defineProperty(_, Symbol.hasInstance, {
      value: (inst) => {
        if (params?.Parent && inst instanceof params.Parent)
          return true;
        return inst?._zod?.traits?.has(name);
      }
    });
    Object.defineProperty(_, "name", { value: name });
    return _;
  }
  class $ZodAsyncError extends Error {
    constructor() {
      super(`Encountered Promise during synchronous parse. Use .parseAsync() instead.`);
    }
  }
  class $ZodEncodeError extends Error {
    constructor(name) {
      super(`Encountered unidirectional transform during encode: ${name}`);
      this.name = "ZodEncodeError";
    }
  }
  (_a$1 = globalThis).__zod_globalConfig ?? (_a$1.__zod_globalConfig = {});
  const globalConfig = globalThis.__zod_globalConfig;
  function config(newConfig) {
    if (newConfig)
      Object.assign(globalConfig, newConfig);
    return globalConfig;
  }
  function _getMessage() {
    const internals = this._zod;
    internals.message ?? (internals.message = JSON.stringify(internals.def, jsonStringifyReplacer, 2));
    return internals.message;
  }
  function _setMessage(value) {
    this._zod.message = value;
  }
  const _messageDesc = {
    get: _getMessage,
    set: _setMessage,
    enumerable: true,
    configurable: true
  };
  const _issuesDesc = { value: void 0, enumerable: false };
  const _installedToString = /* @__PURE__ */ new WeakSet([Object.prototype, Error.prototype]);
  const initializer$1 = (inst, def) => {
    inst.name = "$ZodError";
    _issuesDesc.value = def;
    Object.defineProperty(inst, "issues", _issuesDesc);
    _issuesDesc.value = void 0;
    Object.defineProperty(inst, "message", _messageDesc);
    const proto = Object.getPrototypeOf(inst);
    if (!_installedToString.has(proto)) {
      _installedToString.add(proto);
      Object.defineProperty(proto, "toString", {
        configurable: true,
        enumerable: false,
        get() {
          const value = () => this.message;
          Object.defineProperty(this, "toString", { value, configurable: true, writable: true });
          return value;
        },
        set(value) {
          Object.defineProperty(this, "toString", { value, configurable: true, writable: true });
        }
      });
    }
  };
  const $ZodError = $constructor("$ZodError", initializer$1);
  function node(obj, key, make) {
    if (!Object.prototype.hasOwnProperty.call(obj, key)) {
      if (key === "__proto__") {
        Object.defineProperty(obj, key, { value: make(), writable: true, enumerable: true, configurable: true });
      } else {
        obj[key] = make();
      }
    }
    return obj[key];
  }
  function flattenError(error2, mapper = (issue2) => issue2.message) {
    const fieldErrors = {};
    const formErrors = [];
    for (const sub of error2.issues) {
      if (sub.path.length > 0) {
        node(fieldErrors, sub.path[0], () => []).push(mapper(sub));
      } else {
        formErrors.push(mapper(sub));
      }
    }
    return { formErrors, fieldErrors };
  }
  function formatError(error2, mapper = (issue2) => issue2.message) {
    const fieldErrors = { _errors: [] };
    const processError = (error3, path = []) => {
      for (const issue2 of error3.issues) {
        if (issue2.code === "invalid_union" && issue2.errors.length) {
          issue2.errors.map((issues) => processError({ issues }, [...path, ...issue2.path]));
        } else if (issue2.code === "invalid_key") {
          processError({ issues: issue2.issues }, [...path, ...issue2.path]);
        } else if (issue2.code === "invalid_element") {
          processError({ issues: issue2.issues }, [...path, ...issue2.path]);
        } else {
          const fullpath = [...path, ...issue2.path];
          if (fullpath.length === 0) {
            fieldErrors._errors.push(mapper(issue2));
          } else {
            let curr = fieldErrors;
            let i = 0;
            while (i < fullpath.length) {
              const el = fullpath[i];
              const terminal = i === fullpath.length - 1;
              if (el === "_errors") {
                if (terminal)
                  curr._errors.push(mapper(issue2));
                i++;
                continue;
              }
              if (!Object.prototype.hasOwnProperty.call(curr, el)) {
                Object.defineProperty(curr, el, {
                  value: { _errors: [] },
                  enumerable: true,
                  writable: true,
                  configurable: true
                });
              }
              const node2 = curr[el];
              if (terminal) {
                node2._errors.push(mapper(issue2));
              }
              curr = node2;
              i++;
            }
          }
        }
      }
    };
    processError(error2);
    return fieldErrors;
  }
  function finalizeParams(callee, params) {
    return { callee: params?.callee ?? callee, Err: params?.Err };
  }
  const _parse = (_Err) => {
    const fn = (schema, value, _ctx, _params) => {
      const ctx = _ctx ? { ..._ctx, async: false } : { async: false };
      const result = schema._zod.run({ value, issues: [] }, ctx);
      if (result instanceof Promise) {
        throw new $ZodAsyncError();
      }
      if (result.issues.length) {
        const e = new (_params?.Err ?? _Err)(result.issues.map((iss) => finalizeIssue(iss, ctx, config())));
        captureStackTrace(e, _params?.callee ?? fn);
        throw e;
      }
      return result.value;
    };
    return fn;
  };
  const _parseAsync = (_Err) => {
    const fn = async (schema, value, _ctx, params) => {
      const ctx = _ctx ? { ..._ctx, async: true } : { async: true };
      let result = schema._zod.run({ value, issues: [] }, ctx);
      if (result instanceof Promise)
        result = await result;
      if (result.issues.length) {
        const e = new (params?.Err ?? _Err)(result.issues.map((iss) => finalizeIssue(iss, ctx, config())));
        captureStackTrace(e, params?.callee ?? fn);
        throw e;
      }
      return result.value;
    };
    return fn;
  };
  const _safeParse = (_Err) => (schema, value, _ctx) => {
    const ctx = _ctx ? { ..._ctx, async: false } : { async: false };
    const result = schema._zod.run({ value, issues: [] }, ctx);
    if (result instanceof Promise) {
      throw new $ZodAsyncError();
    }
    return result.issues.length ? failure(_Err, result.issues, ctx) : { success: true, data: result.value };
  };
  function failure(Err, issues, ctx) {
    let error2;
    return {
      success: false,
      get error() {
        if (!error2) {
          error2 = new Err(issues.map((iss) => finalizeIssue(iss, ctx, config())));
          issues = void 0;
          ctx = void 0;
        }
        return error2;
      },
      set error(e) {
        error2 = e;
        issues = void 0;
        ctx = void 0;
      }
    };
  }
  const _safeParseAsync = (_Err) => async (schema, value, _ctx) => {
    const ctx = _ctx ? { ..._ctx, async: true } : { async: true };
    let result = schema._zod.run({ value, issues: [] }, ctx);
    if (result instanceof Promise)
      result = await result;
    return result.issues.length ? failure(_Err, result.issues, ctx) : { success: true, data: result.value };
  };
  const COMPILE_INVALID = /* @__PURE__ */ Symbol.for("zod.compile.invalid");
  const COMPILE_FALLBACK = /* @__PURE__ */ Symbol.for("zod.compile.fallback");
  const validate = ((schema, value, _ctx) => {
    const validator = schema._zod.bag.validator;
    if (validator !== void 0) {
      if (validator(value) !== COMPILE_INVALID)
        return true;
      if (validator.definite === true && _ctx === void 0)
        return false;
    }
    return validateFallback(schema, value, _ctx);
  });
  function validateFallback(schema, value, _ctx) {
    const ctx = _ctx ? { ..._ctx, async: false, abortEarly: true } : { async: false, abortEarly: true };
    const fallbackRun = schema._zod.bag.fallbackRun;
    let result;
    if (fallbackRun) {
      ctx[COMPILE_FALLBACK] = true;
      result = fallbackRun({ value, issues: [] }, ctx);
    } else {
      result = schema._zod.run({ value, issues: [] }, ctx);
    }
    if (result instanceof Promise) {
      throw new $ZodAsyncError();
    }
    return result.issues.length === 0;
  }
  const validateAsync$1 = async (schema, value, _ctx) => {
    const ctx = _ctx ? { ..._ctx, async: true, abortEarly: true } : { async: true, abortEarly: true };
    let result = schema._zod.run({ value, issues: [] }, ctx);
    if (result instanceof Promise)
      result = await result;
    return result.issues.length === 0;
  };
  const _encode = (_Err) => {
    const parse2 = _parse(_Err);
    const fn = (schema, value, _ctx, _params) => {
      const ctx = _ctx ? { ..._ctx, direction: "backward" } : { direction: "backward" };
      return parse2(schema, value, ctx, finalizeParams(fn, _params));
    };
    return fn;
  };
  const _decode = (_Err) => {
    const parse2 = _parse(_Err);
    const fn = (schema, value, _ctx, _params) => {
      return parse2(schema, value, _ctx, finalizeParams(fn, _params));
    };
    return fn;
  };
  const _encodeAsync = (_Err) => {
    const parseAsync2 = _parseAsync(_Err);
    const fn = async (schema, value, _ctx, _params) => {
      const ctx = _ctx ? { ..._ctx, direction: "backward" } : { direction: "backward" };
      return await parseAsync2(schema, value, ctx, finalizeParams(fn, _params));
    };
    return fn;
  };
  const _decodeAsync = (_Err) => {
    const parseAsync2 = _parseAsync(_Err);
    const fn = async (schema, value, _ctx, _params) => {
      return await parseAsync2(schema, value, _ctx, finalizeParams(fn, _params));
    };
    return fn;
  };
  const _safeEncode = (_Err) => (schema, value, _ctx) => {
    const ctx = _ctx ? { ..._ctx, direction: "backward" } : { direction: "backward" };
    return _safeParse(_Err)(schema, value, ctx);
  };
  const _safeDecode = (_Err) => (schema, value, _ctx) => {
    return _safeParse(_Err)(schema, value, _ctx);
  };
  const _safeEncodeAsync = (_Err) => async (schema, value, _ctx) => {
    const ctx = _ctx ? { ..._ctx, direction: "backward" } : { direction: "backward" };
    return _safeParseAsync(_Err)(schema, value, ctx);
  };
  const _safeDecodeAsync = (_Err) => async (schema, value, _ctx) => {
    return _safeParseAsync(_Err)(schema, value, _ctx);
  };
  const cuid = /^[cC][0-9a-z]{6,}$/;
  const cuid2 = /^[0-9a-z]+$/;
  const ulid = /^[0-7][0-9A-HJKMNP-TV-Za-hjkmnp-tv-z]{25}$/;
  const xid = /^[0-9a-vA-V]{20}$/;
  const ksuid = /^[A-Za-z0-9]{27}$/;
  const nanoid = /^[a-zA-Z0-9_-]{21}$/;
  function nanoidOfLength(length) {
    return new RegExp(`^[a-zA-Z0-9_-]{${length}}$`);
  }
  const duration = /^P(?:(\d+W)|(?!.*W)(?=\d|T\d)(\d+Y)?(\d+M)?(\d+D)?(T(?=\d)(\d+H)?(\d+M)?(\d+([.,]\d+)?S)?)?)$/;
  const guid = /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/;
  const uuid = (version2) => {
    if (!version2)
      return /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/;
    return new RegExp(`^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-${version2}[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})$`);
  };
  const email = /^(?:[A-Za-z0-9_'+\-]+\.)*[A-Za-z0-9_'+\-]*[A-Za-z0-9_+-]@(?:[A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$/;
  const _emoji$1 = `^(?=[\\s\\S]*[\\p{Extended_Pictographic}\\p{Regional_Indicator}\\u20E3])[\\p{Extended_Pictographic}\\p{Emoji_Component}]+$`;
  function emoji() {
    return new RegExp(_emoji$1, "u");
  }
  const ipv4 = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/;
  const ipv6 = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:))$/;
  const cidrv4 = /^((25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/([0-9]|[1-2][0-9]|3[0-2])$/;
  const cidrv6 = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:))\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/;
  const base64 = /^$|^(?:[0-9a-zA-Z+/]{4})*(?:(?:[0-9a-zA-Z+/]{2}==)|(?:[0-9a-zA-Z+/]{3}=))?$/;
  const base64url = /^(?:[A-Za-z0-9_-]{4})*(?:[A-Za-z0-9_-]{2,3})?$/;
  const httpProtocol = /^https?$/;
  const e164 = /^\+[1-9]\d{6,14}$/;
  const dateSource = `(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))`;
  function anchor(source) {
    return new RegExp(`^${source}$`);
  }
  const date = /* @__PURE__ */ anchor(dateSource);
  function timeSource(args) {
    const hhmm = `(?:[01]\\d|2[0-3]):[0-5]\\d`;
    const regex = typeof args.precision === "number" ? args.precision === -1 ? `${hhmm}` : args.precision === 0 ? `${hhmm}:[0-5]\\d` : `${hhmm}:[0-5]\\d\\.\\d{${args.precision}}` : args.seconds ? `${hhmm}:[0-5]\\d(?:\\.\\d+)?` : `${hhmm}(?::[0-5]\\d(?:\\.\\d+)?)?`;
    return regex;
  }
  function time(args) {
    return new RegExp(`^${timeSource(args)}$`);
  }
  function datetime(args) {
    const opts = ["Z"];
    if (args.offset)
      opts.push(`([+-](?:[01]\\d|2[0-3]):[0-5]\\d)`);
    const qualified = `${timeSource({ precision: args.precision, seconds: true })}(?:${opts.join("|")})`;
    const timeRegex = args.local ? `${qualified}|${timeSource({ precision: args.precision })}` : qualified;
    return new RegExp(`^${dateSource}T(?:${timeRegex})$`);
  }
  const anyString = /^[\s\S]{0,}$/;
  const integer = /^-?\d+$/;
  const number$1 = /^-?\d+(?:\.\d+)?$/;
  const boolean$1 = /^(?:true|false)$/i;
  const lowercase = /^[^A-Z]*$/;
  const uppercase = /^[^a-z]*$/;
  const $ZodCheck = /* @__PURE__ */ $constructor("$ZodCheck", (inst, def) => {
    var _a2;
    inst._zod ?? (inst._zod = {});
    inst._zod.def = def;
    (_a2 = inst._zod).onattach ?? (_a2.onattach = []);
  });
  const _whenHasLength = (payload) => {
    const val = payload.value;
    return !nullish(val) && val.length !== void 0;
  };
  const numericOriginMap = {
    number: "number",
    bigint: "bigint",
    object: "date"
  };
  const $ZodCheckLessThan = /* @__PURE__ */ $constructor("$ZodCheckLessThan", (inst, def) => {
    $ZodCheck.init(inst, def);
    const origin = numericOriginMap[typeof def.value];
    inst._zod.check = (payload) => {
      if (def.inclusive ? payload.value <= def.value : payload.value < def.value) {
        return;
      }
      payload.issues.push({
        origin: numericOriginMap[typeof payload.value] ?? origin,
        code: "too_big",
        maximum: typeof def.value === "object" ? def.value.getTime() : def.value,
        input: payload.value,
        inclusive: def.inclusive,
        inst,
        continue: !def.abort
      });
    };
  });
  const $ZodCheckGreaterThan = /* @__PURE__ */ $constructor("$ZodCheckGreaterThan", (inst, def) => {
    $ZodCheck.init(inst, def);
    const origin = numericOriginMap[typeof def.value];
    inst._zod.check = (payload) => {
      if (def.inclusive ? payload.value >= def.value : payload.value > def.value) {
        return;
      }
      payload.issues.push({
        origin: numericOriginMap[typeof payload.value] ?? origin,
        code: "too_small",
        minimum: typeof def.value === "object" ? def.value.getTime() : def.value,
        input: payload.value,
        inclusive: def.inclusive,
        inst,
        continue: !def.abort
      });
    };
  });
  const $ZodCheckMultipleOf = /* @__PURE__ */ $constructor("$ZodCheckMultipleOf", (inst, def) => {
    $ZodCheck.init(inst, def);
    inst._zod.check = (payload) => {
      if (typeof payload.value !== typeof def.value)
        throw new Error("Cannot mix number and bigint in multiple_of check.");
      const isMultiple = typeof payload.value === "bigint" ? (
        // `value % 0n` throws, and nothing is a multiple of zero — the number branch already fails this way via NaN
        def.value !== BigInt(0) && payload.value % def.value === BigInt(0)
      ) : floatSafeRemainder(payload.value, def.value) === 0;
      if (isMultiple)
        return;
      payload.issues.push({
        origin: typeof payload.value,
        code: "not_multiple_of",
        divisor: def.value,
        input: payload.value,
        inst,
        continue: !def.abort
      });
    };
  });
  const $ZodCheckNumberFormat = /* @__PURE__ */ $constructor("$ZodCheckNumberFormat", (inst, def) => {
    $ZodCheck.init(inst, def);
    def.format = def.format || "float64";
    const isInt = def.format?.includes("int");
    const origin = isInt ? "int" : "number";
    const [minimum, maximum] = NUMBER_FORMAT_RANGES[def.format];
    inst._zod.check = (payload) => {
      const input = payload.value;
      if (isInt) {
        if (!Number.isInteger(input)) {
          payload.issues.push({
            expected: origin,
            format: def.format,
            code: "invalid_type",
            continue: false,
            input,
            inst
          });
          return;
        }
        if (!Number.isSafeInteger(input)) {
          if (input > 0) {
            payload.issues.push({
              input,
              code: "too_big",
              maximum: Number.MAX_SAFE_INTEGER,
              note: "Integers must be within the safe integer range.",
              inst,
              origin,
              inclusive: true,
              continue: !def.abort
            });
          } else {
            payload.issues.push({
              input,
              code: "too_small",
              minimum: Number.MIN_SAFE_INTEGER,
              note: "Integers must be within the safe integer range.",
              inst,
              origin,
              inclusive: true,
              continue: !def.abort
            });
          }
          return;
        }
      }
      if (input < minimum) {
        payload.issues.push({
          origin: "number",
          input,
          code: "too_small",
          minimum,
          inclusive: true,
          inst,
          continue: !def.abort
        });
      }
      if (input > maximum) {
        payload.issues.push({
          origin: "number",
          input,
          code: "too_big",
          maximum,
          inclusive: true,
          inst,
          continue: !def.abort
        });
      }
    };
  });
  const $ZodCheckMaxLength = /* @__PURE__ */ $constructor("$ZodCheckMaxLength", (inst, def) => {
    var _a2;
    $ZodCheck.init(inst, def);
    (_a2 = inst._zod.def).when ?? (_a2.when = _whenHasLength);
    inst._zod.check = (payload) => {
      const input = payload.value;
      const units = input.length;
      const length = typeof input === "string" && units > def.maximum ? codePointLength(input) : units;
      if (length <= def.maximum)
        return;
      const origin = getLengthableOrigin(input);
      payload.issues.push({
        origin,
        code: "too_big",
        maximum: def.maximum,
        inclusive: true,
        input,
        inst,
        continue: !def.abort
      });
    };
  });
  const $ZodCheckMinLength = /* @__PURE__ */ $constructor("$ZodCheckMinLength", (inst, def) => {
    var _a2;
    $ZodCheck.init(inst, def);
    (_a2 = inst._zod.def).when ?? (_a2.when = _whenHasLength);
    inst._zod.check = (payload) => {
      const input = payload.value;
      const units = input.length;
      const length = typeof input === "string" && units >= def.minimum && units < def.minimum * 2 ? codePointLength(input) : units;
      if (length >= def.minimum)
        return;
      const origin = getLengthableOrigin(input);
      payload.issues.push({
        origin,
        code: "too_small",
        minimum: def.minimum,
        inclusive: true,
        input,
        inst,
        continue: !def.abort
      });
    };
  });
  const $ZodCheckLengthEquals = /* @__PURE__ */ $constructor("$ZodCheckLengthEquals", (inst, def) => {
    var _a2;
    $ZodCheck.init(inst, def);
    (_a2 = inst._zod.def).when ?? (_a2.when = _whenHasLength);
    inst._zod.check = (payload) => {
      const input = payload.value;
      const units = input.length;
      const length = typeof input === "string" && units >= def.length && units <= def.length * 2 ? codePointLength(input) : units;
      if (length === def.length)
        return;
      const origin = getLengthableOrigin(input);
      const tooBig = length > def.length;
      payload.issues.push({
        origin,
        ...tooBig ? { code: "too_big", maximum: def.length } : { code: "too_small", minimum: def.length },
        inclusive: true,
        exact: true,
        input: payload.value,
        inst,
        continue: !def.abort
      });
    };
  });
  const $ZodCheckStringFormat = /* @__PURE__ */ $constructor("$ZodCheckStringFormat", (inst, def) => {
    var _a2, _b;
    $ZodCheck.init(inst, def);
    if (def.pattern)
      (_a2 = inst._zod).check ?? (_a2.check = (payload) => {
        def.pattern.lastIndex = 0;
        if (def.pattern.test(payload.value))
          return;
        payload.issues.push({
          origin: "string",
          code: "invalid_format",
          format: def.format,
          input: payload.value,
          ...def.pattern ? { pattern: def.pattern.toString() } : {},
          inst,
          continue: !def.abort
        });
      });
    else
      (_b = inst._zod).check ?? (_b.check = () => {
      });
  });
  const $ZodCheckRegex = /* @__PURE__ */ $constructor("$ZodCheckRegex", (inst, def) => {
    $ZodCheckStringFormat.init(inst, def);
    inst._zod.check = (payload) => {
      def.pattern.lastIndex = 0;
      if (def.pattern.test(payload.value))
        return;
      payload.issues.push({
        origin: "string",
        code: "invalid_format",
        format: "regex",
        input: payload.value,
        pattern: def.pattern.toString(),
        inst,
        continue: !def.abort
      });
    };
  });
  const $ZodCheckLowerCase = /* @__PURE__ */ $constructor("$ZodCheckLowerCase", (inst, def) => {
    def.pattern ?? (def.pattern = lowercase);
    $ZodCheckStringFormat.init(inst, def);
  });
  const $ZodCheckUpperCase = /* @__PURE__ */ $constructor("$ZodCheckUpperCase", (inst, def) => {
    def.pattern ?? (def.pattern = uppercase);
    $ZodCheckStringFormat.init(inst, def);
  });
  const $ZodCheckIncludes = /* @__PURE__ */ $constructor("$ZodCheckIncludes", (inst, def) => {
    $ZodCheck.init(inst, def);
    const escapedRegex = escapeRegex(def.includes);
    const pattern = new RegExp(typeof def.position === "number" ? `^.{${def.position},}${escapedRegex}` : escapedRegex);
    def.pattern = pattern;
    inst._zod.check = (payload) => {
      if (payload.value.includes(def.includes, def.position))
        return;
      payload.issues.push({
        origin: "string",
        code: "invalid_format",
        format: "includes",
        includes: def.includes,
        input: payload.value,
        inst,
        continue: !def.abort
      });
    };
  });
  const $ZodCheckStartsWith = /* @__PURE__ */ $constructor("$ZodCheckStartsWith", (inst, def) => {
    $ZodCheck.init(inst, def);
    const pattern = new RegExp(`^${escapeRegex(def.prefix)}.*`);
    def.pattern ?? (def.pattern = pattern);
    inst._zod.check = (payload) => {
      if (payload.value.startsWith(def.prefix))
        return;
      payload.issues.push({
        origin: "string",
        code: "invalid_format",
        format: "starts_with",
        prefix: def.prefix,
        input: payload.value,
        inst,
        continue: !def.abort
      });
    };
  });
  const $ZodCheckEndsWith = /* @__PURE__ */ $constructor("$ZodCheckEndsWith", (inst, def) => {
    $ZodCheck.init(inst, def);
    const pattern = new RegExp(`.*${escapeRegex(def.suffix)}$`);
    def.pattern ?? (def.pattern = pattern);
    inst._zod.check = (payload) => {
      if (payload.value.endsWith(def.suffix))
        return;
      payload.issues.push({
        origin: "string",
        code: "invalid_format",
        format: "ends_with",
        suffix: def.suffix,
        input: payload.value,
        inst,
        continue: !def.abort
      });
    };
  });
  function handleCheckPropertyResult(result, payload, property) {
    if (result.issues.length) {
      payload.issues.push(...prefixIssues(property, result.issues));
    }
  }
  const $ZodCheckProperties = /* @__PURE__ */ $constructor("$ZodCheckProperties", (inst, def) => {
    $ZodCheck.init(inst, def);
    hide(inst, Symbol.iterator, function* () {
      yield inst;
    });
    let entries;
    inst._zod.check = (payload) => {
      if (payload.value == null) {
        payload.issues.push({ expected: "object", code: "invalid_type", input: payload.value, inst });
        return void 0;
      }
      entries ?? (entries = Reflect.ownKeys(def.shape).map((key) => [key, def.shape[key]]));
      const input = payload.value;
      let proms;
      for (const [key, schema] of entries) {
        const result = schema._zod.run({ value: input[key], issues: [] }, {});
        if (result instanceof Promise) {
          proms ?? (proms = []);
          proms.push(result.then((result2) => handleCheckPropertyResult(result2, payload, key)));
        } else {
          handleCheckPropertyResult(result, payload, key);
        }
      }
      if (proms)
        return Promise.all(proms).then(() => void 0);
      return void 0;
    };
  });
  const $ZodCheckOverwrite = /* @__PURE__ */ $constructor("$ZodCheckOverwrite", (inst, def) => {
    $ZodCheck.init(inst, def);
    inst._zod.check = (payload) => {
      payload.value = def.tx(payload.value);
    };
  });
  class Doc {
    constructor(args = [], closed = {}) {
      this.content = [];
      this.indent = 0;
      this.args = args;
      this.closed = closed;
    }
    // the compiler catches a child's throw and keeps writing into this doc, so the indent has to unwind with it
    indented(fn) {
      this.indent += 1;
      try {
        fn(this);
      } finally {
        this.indent -= 1;
      }
    }
    write(arg) {
      if (typeof arg === "function") {
        arg(this, { execution: "sync" });
        arg(this, { execution: "async" });
        return;
      }
      const content = arg;
      const lines = content.split("\n").filter((x) => x);
      const minIndent = Math.min(...lines.map((x) => x.length - x.trimStart().length));
      const dedented = lines.map((x) => x.slice(minIndent)).map((x) => " ".repeat(this.indent * 2) + x);
      for (const line of dedented) {
        this.content.push(line);
      }
    }
    compile() {
      const F = Function;
      const content = this?.content ?? [``];
      const factory = new F(...Object.keys(this.closed), `return function (${this.args.join(", ")}) {
${content.join("\n")}
};`);
      return factory(...Object.values(this.closed));
    }
  }
  const version = {
    major: 4,
    minor: 6,
    patch: 6
  };
  const $ZodType = /* @__PURE__ */ $constructor("$ZodType", (inst, def) => {
    var _a2;
    inst ?? (inst = {});
    inst._zod.def = def;
    inst._zod.bag = inst._zod.bag || {};
    inst._zod.version = version;
    const defChecks = inst._zod.def.checks;
    const checks = inst._zod.traits.has("$ZodCheck") ? [inst, ...defChecks ?? []] : defChecks?.length ? [...defChecks] : [];
    for (const ch of checks) {
      for (const fn of ch._zod.onattach) {
        fn(inst);
      }
    }
    if (checks.length === 0) {
      (_a2 = inst._zod).deferred ?? (_a2.deferred = []);
      inst._zod.deferred?.push(() => {
        inst._zod.run = inst._zod.parse;
      });
    } else {
      const runChecks = (payload, checks2, ctx) => {
        if (payload.memo)
          return payload;
        let isAborted = aborted(payload);
        let asyncResult;
        for (const ch of checks2) {
          if (ch._zod.def.when) {
            if (explicitlyAborted(payload))
              continue;
            const shouldRun = ch._zod.def.when(payload);
            if (!shouldRun)
              continue;
          } else if (isAborted) {
            continue;
          }
          const currLen = payload.issues.length;
          const _ = ch._zod.check(payload);
          if (_ instanceof Promise && ctx?.async === false) {
            throw new $ZodAsyncError();
          }
          if (asyncResult || _ instanceof Promise) {
            asyncResult = (asyncResult ?? Promise.resolve()).then(async () => {
              await _;
              const nextLen = payload.issues.length;
              if (nextLen === currLen)
                return;
              attachSchema(payload.issues, currLen, inst);
              if (!isAborted)
                isAborted = aborted(payload, currLen);
            });
          } else {
            const nextLen = payload.issues.length;
            if (nextLen === currLen)
              continue;
            attachSchema(payload.issues, currLen, inst);
            if (!isAborted)
              isAborted = aborted(payload, currLen);
          }
        }
        if (asyncResult) {
          return asyncResult.then(() => {
            return payload;
          });
        }
        return payload;
      };
      const handleCanaryResult = (canary, payload, ctx) => {
        if (aborted(canary)) {
          canary.aborted = true;
          return canary;
        }
        const checkResult = runChecks(payload, checks, ctx);
        if (checkResult instanceof Promise) {
          if (ctx.async === false)
            throw new $ZodAsyncError();
          return checkResult.then((checkResult2) => inst._zod.parse(checkResult2, ctx));
        }
        return inst._zod.parse(checkResult, ctx);
      };
      inst._zod.run = (payload, ctx) => {
        if (ctx.skipChecks) {
          return inst._zod.parse(payload, ctx);
        }
        if (ctx.direction === "backward") {
          const canary = inst._zod.parse({ value: payload.value, issues: [] }, { ...ctx, skipChecks: true });
          if (canary instanceof Promise) {
            return canary.then((canary2) => {
              return handleCanaryResult(canary2, payload, ctx);
            });
          }
          return handleCanaryResult(canary, payload, ctx);
        }
        const result = inst._zod.parse(payload, ctx);
        if (result instanceof Promise) {
          if (ctx.async === false)
            throw new $ZodAsyncError();
          return result.then((result2) => runChecks(result2, checks, ctx));
        }
        return runChecks(result, checks, ctx);
      };
    }
  }, {
    // Wrappers extend this by installing a richer factory over it; reading it eagerly would defeat the laziness.
    get "~standard"() {
      return hide(this, "~standard", standardProps(this));
    },
    set "~standard"(value) {
      own(this, "~standard", value);
    }
  });
  const toStandardResult = (r, ctx) => r.issues.length ? { issues: r.issues.map((iss) => finalizeIssue(iss, ctx, config())) } : { value: r.value };
  async function validateAsync(inst, value) {
    const ctx = { async: true };
    return toStandardResult(await inst._zod.run({ value, issues: [] }, ctx), ctx);
  }
  function standardProps(inst) {
    return {
      validate: (value) => {
        const ctx = { async: false };
        try {
          const r = inst._zod.run({ value, issues: [] }, ctx);
          if (!(r instanceof Promise))
            return toStandardResult(r, ctx);
        } catch (_) {
        }
        return validateAsync(inst, value);
      },
      vendor: "zod",
      version: 1
    };
  }
  const $ZodString = /* @__PURE__ */ $constructor("$ZodString", (inst, def) => {
    $ZodType.init(inst, def);
    inst._zod.pattern = def.pattern ?? anyString;
    inst._zod.parse = (payload, _) => {
      if (def.coerce)
        try {
          payload.value = String(payload.value);
        } catch (_2) {
        }
      if (typeof payload.value === "string")
        return payload;
      payload.issues.push({
        expected: "string",
        code: "invalid_type",
        input: payload.value,
        inst
      });
      return payload;
    };
  });
  const $ZodStringFormat = /* @__PURE__ */ $constructor("$ZodStringFormat", (inst, def) => {
    $ZodCheckStringFormat.init(inst, def);
    $ZodString.init(inst, def);
  });
  const $ZodGUID = /* @__PURE__ */ $constructor("$ZodGUID", (inst, def) => {
    def.pattern ?? (def.pattern = guid);
    $ZodStringFormat.init(inst, def);
  });
  const $ZodUUID = /* @__PURE__ */ $constructor("$ZodUUID", (inst, def) => {
    if (def.version) {
      const versionMap = {
        v1: 1,
        v2: 2,
        v3: 3,
        v4: 4,
        v5: 5,
        v6: 6,
        v7: 7,
        v8: 8
      };
      const v = versionMap[def.version];
      if (v === void 0)
        throw new Error(`Invalid UUID version: "${def.version}"`);
      def.pattern ?? (def.pattern = uuid(v));
    } else
      def.pattern ?? (def.pattern = uuid());
    $ZodStringFormat.init(inst, def);
  });
  const $ZodEmail = /* @__PURE__ */ $constructor("$ZodEmail", (inst, def) => {
    def.pattern ?? (def.pattern = email);
    $ZodStringFormat.init(inst, def);
  });
  const URL_BAD_FORMAT = 1;
  const URL_UNPARSEABLE = 2;
  function canParseURL(input) {
    try {
      if (typeof URL !== "undefined" && typeof URL.canParse === "function")
        return URL.canParse(input);
      new URL(input);
      return true;
    } catch {
      return false;
    }
  }
  function validateURL(trimmed, def) {
    if (!("normalize" in def) && !("hostname" in def) && !("protocol" in def)) {
      return canParseURL(trimmed) || URL_UNPARSEABLE;
    }
    return parseURLObject(trimmed, def);
  }
  function parseURLObject(trimmed, def) {
    if (!def.normalize && def.protocol?.source === httpProtocol.source && !/^https?:\/\//i.test(trimmed)) {
      return URL_BAD_FORMAT;
    }
    try {
      if (typeof URL !== "undefined") {
        const URLStatic = URL;
        if (typeof URLStatic.parse === "function")
          return URLStatic.parse(trimmed) ?? URL_UNPARSEABLE;
      }
      return new URL(trimmed);
    } catch {
      return URL_UNPARSEABLE;
    }
  }
  const asciiTabOrNewline = /[\t\n\r]/g;
  function stripTabAndNewline(value) {
    return value.replace(asciiTabOrNewline, "");
  }
  function urlHostnameOk(url, hostname) {
    hostname.lastIndex = 0;
    return hostname.test(url.hostname);
  }
  function urlProtocolOk(url, protocol) {
    protocol.lastIndex = 0;
    return protocol.test(url.protocol.endsWith(":") ? url.protocol.slice(0, -1) : url.protocol);
  }
  const $ZodURL = /* @__PURE__ */ $constructor("$ZodURL", (inst, def) => {
    $ZodStringFormat.init(inst, def);
    inst._zod.check = (payload) => {
      try {
        const trimmed = payload.value.trim();
        const url = validateURL(trimmed, def);
        if (url === URL_BAD_FORMAT) {
          payload.issues.push({
            code: "invalid_format",
            format: "url",
            note: "Invalid URL format",
            input: payload.value,
            inst,
            continue: !def.abort
          });
          return;
        }
        if (url === URL_UNPARSEABLE) {
          payload.issues.push({
            code: "invalid_format",
            format: "url",
            input: payload.value,
            inst,
            continue: !def.abort
          });
          return;
        }
        if (url === true) {
          payload.value = stripTabAndNewline(trimmed);
          return;
        }
        if (def.hostname && !urlHostnameOk(url, def.hostname)) {
          payload.issues.push({
            code: "invalid_format",
            format: "url",
            note: "Invalid hostname",
            pattern: def.hostname.source,
            input: payload.value,
            inst,
            continue: !def.abort
          });
        }
        if (def.protocol && !urlProtocolOk(url, def.protocol)) {
          payload.issues.push({
            code: "invalid_format",
            format: "url",
            note: "Invalid protocol",
            pattern: def.protocol.source,
            input: payload.value,
            inst,
            continue: !def.abort
          });
        }
        payload.value = def.normalize ? url.href : stripTabAndNewline(trimmed);
        return;
      } catch (_) {
        payload.issues.push({
          code: "invalid_format",
          format: "url",
          input: payload.value,
          inst,
          continue: !def.abort
        });
      }
    };
  });
  const $ZodEmoji = /* @__PURE__ */ $constructor("$ZodEmoji", (inst, def) => {
    def.pattern ?? (def.pattern = emoji());
    $ZodStringFormat.init(inst, def);
  });
  const $ZodNanoID = /* @__PURE__ */ $constructor("$ZodNanoID", (inst, def) => {
    if (def.length !== void 0 && (!Number.isInteger(def.length) || def.length < 1))
      throw new Error(`Invalid nanoid length: ${def.length}`);
    def.pattern ?? (def.pattern = def.length === void 0 ? nanoid : nanoidOfLength(def.length));
    $ZodStringFormat.init(inst, def);
  });
  const $ZodCUID = /* @__PURE__ */ $constructor("$ZodCUID", (inst, def) => {
    def.pattern ?? (def.pattern = cuid);
    $ZodStringFormat.init(inst, def);
  });
  const $ZodCUID2 = /* @__PURE__ */ $constructor("$ZodCUID2", (inst, def) => {
    def.pattern ?? (def.pattern = cuid2);
    $ZodStringFormat.init(inst, def);
  });
  const $ZodULID = /* @__PURE__ */ $constructor("$ZodULID", (inst, def) => {
    def.pattern ?? (def.pattern = ulid);
    $ZodStringFormat.init(inst, def);
  });
  const $ZodXID = /* @__PURE__ */ $constructor("$ZodXID", (inst, def) => {
    def.pattern ?? (def.pattern = xid);
    $ZodStringFormat.init(inst, def);
  });
  const $ZodKSUID = /* @__PURE__ */ $constructor("$ZodKSUID", (inst, def) => {
    def.pattern ?? (def.pattern = ksuid);
    $ZodStringFormat.init(inst, def);
  });
  const $ZodISODateTime = /* @__PURE__ */ $constructor("$ZodISODateTime", (inst, def) => {
    def.pattern ?? (def.pattern = datetime(def));
    $ZodStringFormat.init(inst, def);
  });
  const $ZodISODate = /* @__PURE__ */ $constructor("$ZodISODate", (inst, def) => {
    def.pattern ?? (def.pattern = date);
    $ZodStringFormat.init(inst, def);
  });
  const $ZodISOTime = /* @__PURE__ */ $constructor("$ZodISOTime", (inst, def) => {
    def.pattern ?? (def.pattern = time(def));
    $ZodStringFormat.init(inst, def);
  });
  const $ZodISODuration = /* @__PURE__ */ $constructor("$ZodISODuration", (inst, def) => {
    def.pattern ?? (def.pattern = duration);
    $ZodStringFormat.init(inst, def);
  });
  const $ZodIPv4 = /* @__PURE__ */ $constructor("$ZodIPv4", (inst, def) => {
    def.pattern ?? (def.pattern = ipv4);
    $ZodStringFormat.init(inst, def);
  });
  const ipv6Alphabet = /^[0-9a-fA-F:.]+$/;
  function isValidIPv6(value) {
    if (!ipv6Alphabet.test(value))
      return false;
    return canParseURL(`http://[${value}]`);
  }
  const $ZodIPv6 = /* @__PURE__ */ $constructor("$ZodIPv6", (inst, def) => {
    def.pattern ?? (def.pattern = ipv6);
    $ZodStringFormat.init(inst, def);
    inst._zod.check = (payload) => {
      if (!isValidIPv6(payload.value)) {
        payload.issues.push({
          code: "invalid_format",
          format: "ipv6",
          input: payload.value,
          inst,
          continue: !def.abort
        });
      }
    };
  });
  const $ZodCIDRv4 = /* @__PURE__ */ $constructor("$ZodCIDRv4", (inst, def) => {
    def.pattern ?? (def.pattern = cidrv4);
    $ZodStringFormat.init(inst, def);
  });
  function isValidCIDRv6(value) {
    const parts = value.split("/");
    if (parts.length !== 2)
      return false;
    const [address, prefix] = parts;
    if (!prefix)
      return false;
    const prefixNum = Number(prefix);
    if (`${prefixNum}` !== prefix)
      return false;
    if (prefixNum < 0 || prefixNum > 128)
      return false;
    return isValidIPv6(address);
  }
  const $ZodCIDRv6 = /* @__PURE__ */ $constructor("$ZodCIDRv6", (inst, def) => {
    def.pattern ?? (def.pattern = cidrv6);
    $ZodStringFormat.init(inst, def);
    inst._zod.check = (payload) => {
      if (!isValidCIDRv6(payload.value)) {
        payload.issues.push({
          code: "invalid_format",
          format: "cidrv6",
          input: payload.value,
          inst,
          continue: !def.abort
        });
      }
    };
  });
  function isValidBase64(data) {
    if (data === "")
      return true;
    if (/\s/.test(data))
      return false;
    if (data.length % 4 !== 0)
      return false;
    try {
      atob(data);
      return true;
    } catch {
      return false;
    }
  }
  const base64Charset = /^[0-9a-zA-Z+/]*={0,2}$/;
  const $ZodBase64 = /* @__PURE__ */ $constructor("$ZodBase64", (inst, def) => {
    def.pattern ?? (def.pattern = base64Charset);
    $ZodStringFormat.init(inst, def);
    inst._zod.check = (payload) => {
      if (isValidBase64(payload.value))
        return;
      payload.issues.push({
        code: "invalid_format",
        format: "base64",
        input: payload.value,
        inst,
        continue: !def.abort
      });
    };
  });
  const base64urlCharset = /^[A-Za-z0-9_-]*$/;
  function isValidBase64URL(data) {
    if (!base64urlCharset.test(data))
      return false;
    const base642 = data.replace(/[-_]/g, (c) => c === "-" ? "+" : "/");
    const padded = base642.padEnd(Math.ceil(base642.length / 4) * 4, "=");
    return isValidBase64(padded);
  }
  const $ZodBase64URL = /* @__PURE__ */ $constructor("$ZodBase64URL", (inst, def) => {
    def.pattern ?? (def.pattern = base64urlCharset);
    $ZodStringFormat.init(inst, def);
    inst._zod.check = (payload) => {
      if (isValidBase64URL(payload.value))
        return;
      payload.issues.push({
        code: "invalid_format",
        format: "base64url",
        input: payload.value,
        inst,
        continue: !def.abort
      });
    };
  });
  const $ZodE164 = /* @__PURE__ */ $constructor("$ZodE164", (inst, def) => {
    def.pattern ?? (def.pattern = e164);
    $ZodStringFormat.init(inst, def);
  });
  function isValidJWT(token, algorithm = null) {
    try {
      const tokensParts = token.split(".");
      if (tokensParts.length !== 3)
        return false;
      const [header] = tokensParts;
      if (!header)
        return false;
      const parsedHeader = JSON.parse(atob(header));
      if ("typ" in parsedHeader && parsedHeader?.typ !== "JWT")
        return false;
      if (!parsedHeader.alg)
        return false;
      if (algorithm && (!("alg" in parsedHeader) || parsedHeader.alg !== algorithm))
        return false;
      return true;
    } catch {
      return false;
    }
  }
  const $ZodJWT = /* @__PURE__ */ $constructor("$ZodJWT", (inst, def) => {
    $ZodStringFormat.init(inst, def);
    inst._zod.check = (payload) => {
      if (isValidJWT(payload.value, def.alg))
        return;
      payload.issues.push({
        code: "invalid_format",
        format: "jwt",
        input: payload.value,
        inst,
        continue: !def.abort
      });
    };
  });
  const $ZodNumber = /* @__PURE__ */ $constructor("$ZodNumber", (inst, def) => {
    $ZodType.init(inst, def);
    inst._zod.pattern = number$1;
    inst._zod.parse = (payload, _ctx) => {
      if (def.coerce)
        try {
          payload.value = Number(payload.value);
        } catch (_) {
        }
      const input = payload.value;
      if (typeof input === "number" && !Number.isNaN(input) && Number.isFinite(input)) {
        return payload;
      }
      const received = typeof input === "number" ? Number.isNaN(input) ? "NaN" : !Number.isFinite(input) ? String(input) : void 0 : void 0;
      payload.issues.push({
        expected: "number",
        code: "invalid_type",
        input,
        inst,
        ...received ? { received } : {}
      });
      return payload;
    };
  });
  const $ZodNumberFormat = /* @__PURE__ */ $constructor("$ZodNumberFormat", (inst, def) => {
    $ZodCheckNumberFormat.init(inst, def);
    $ZodNumber.init(inst, def);
  });
  const $ZodBoolean = /* @__PURE__ */ $constructor("$ZodBoolean", (inst, def) => {
    $ZodType.init(inst, def);
    inst._zod.pattern = boolean$1;
    inst._zod.parse = (payload, _ctx) => {
      if (def.coerce)
        try {
          payload.value = Boolean(payload.value);
        } catch (_) {
        }
      const input = payload.value;
      if (typeof input === "boolean")
        return payload;
      payload.issues.push({
        expected: "boolean",
        code: "invalid_type",
        input,
        inst
      });
      return payload;
    };
  });
  const $ZodUnknown = /* @__PURE__ */ $constructor("$ZodUnknown", (inst, def) => {
    $ZodType.init(inst, def);
    inst._zod.parse = (payload) => payload;
  });
  const $ZodNever = /* @__PURE__ */ $constructor("$ZodNever", (inst, def) => {
    $ZodType.init(inst, def);
    inst._zod.parse = (payload, _ctx) => {
      payload.issues.push({
        expected: "never",
        code: "invalid_type",
        input: payload.value,
        inst
      });
      return payload;
    };
  });
  function capSize(inst, size) {
    const caps = sizeCaps(inst._zod.def.checks);
    if (!caps.length)
      return;
    const cap = Math.min(...caps.map((c) => c[0]));
    const parse2 = inst._zod.parse;
    inst._zod.parse = (payload, ctx) => {
      const n = size(payload.value);
      if (n > cap && !ctx?.skipChecks && ctx?.direction !== "backward") {
        for (const [max, ch] of sizeCaps(inst._zod.def.checks)) {
          if (n > max && ch._zod.def.when(payload)) {
            const start = payload.issues.length;
            ch._zod.check(payload);
            payload.issues[start].continue = false;
            attachSchema(payload.issues, start, inst);
            return payload;
          }
        }
      }
      return parse2(payload, ctx);
    };
  }
  const arraySize = (input) => Array.isArray(input) ? input.length : -1;
  function handleArrayResult(result, final, index) {
    if (result.issues.length) {
      final.issues.push(...prefixIssues(index, result.issues));
    }
    final.value[index] = result.value;
  }
  const $ZodArray = /* @__PURE__ */ $constructor("$ZodArray", (inst, def) => {
    $ZodType.init(inst, def);
    const memo2 = globalConfig.memoizer;
    memo2?.attach(inst);
    inst._zod.parse = (payload, ctx) => {
      const input = payload.value;
      if (!Array.isArray(input)) {
        payload.issues.push({
          expected: "array",
          code: "invalid_type",
          input,
          inst
        });
        return payload;
      }
      payload.value = memo2 ? memo2.alloc(inst, payload, Array(input.length), ctx) : Array(input.length);
      const proms = [];
      const abortEarly = ctx?.abortEarly;
      for (let i = 0; i < input.length; i++) {
        const item = input[i];
        const result = def.element._zod.run({
          value: item,
          issues: []
        }, ctx);
        if (result instanceof Promise) {
          proms.push(result.then((result2) => handleArrayResult(result2, payload, i)));
        } else {
          handleArrayResult(result, payload, i);
          if (abortEarly && result.issues.length !== 0 && aborted(result))
            break;
        }
      }
      if (proms.length) {
        return Promise.all(proms).then(() => payload);
      }
      return payload;
    };
    capSize(inst, arraySize);
  });
  function handlePropertyResult(result, final, key, input, optin, optout) {
    const isPresent = key in input;
    const isOptionalOut = optout === "optional";
    if (!isPresent && isOptionalOut && optin === "optional") {
      return;
    }
    if (result.issues.length) {
      if (optin !== void 0 && isOptionalOut && !isPresent) {
        return;
      }
      final.issues.push(...prefixIssues(key, result.issues));
    }
    if (!isPresent && optin === void 0) {
      if (!result.issues.length) {
        final.issues.push({
          code: "invalid_type",
          expected: "nonoptional",
          input: void 0,
          path: [key]
        });
      }
      return;
    }
    if (result.value === void 0) {
      if (isPresent || optin === "defaulted" && !isOptionalOut) {
        final.value[key] = void 0;
      }
    } else {
      final.value[key] = result.value;
    }
  }
  const NO_SYMBOL_KEYS = [];
  function normalizeDef(def) {
    const keys = Object.keys(def.shape);
    const ownSymbols = Object.getOwnPropertySymbols(def.shape);
    const symbolKeys = ownSymbols.length ? ownSymbols : NO_SYMBOL_KEYS;
    const allKeys = symbolKeys.length ? [...keys, ...symbolKeys] : keys;
    for (const k of allKeys) {
      if (!def.shape?.[k]?._zod?.traits?.has("$ZodType")) {
        throw new Error(`Invalid element at key "${String(k)}": expected a Zod schema`);
      }
    }
    const okeys = optionalKeys(def.shape);
    return {
      ...def,
      allKeys,
      symbolKeys,
      // string-only: handleCatchall matches it against `for...in`, which never yields a symbol
      keySet: new Set(keys),
      numKeys: keys.length,
      optionalKeys: new Set(okeys)
    };
  }
  function handleCatchall(proms, input, payload, ctx, def, inst, abortEarly) {
    const unrecognized = [];
    const keySet = def.keySet;
    const _catchall = def.catchall._zod;
    const t = _catchall.def.type;
    const optin = _catchall.optin;
    const optout = _catchall.optout;
    let seen = 0;
    for (const key in input) {
      if (abortEarly && payload.issues.length !== seen) {
        if (aborted(payload, seen))
          break;
        seen = payload.issues.length;
      }
      if (keySet.has(key))
        continue;
      if (key === "__proto__") {
        if (t === "never")
          unrecognized.push(key);
        continue;
      }
      if (t === "never") {
        unrecognized.push(key);
        continue;
      }
      const r = _catchall.run({ value: input[key], issues: [] }, ctx);
      if (r instanceof Promise) {
        proms.push(r.then((r2) => handlePropertyResult(r2, payload, key, input, optin, optout)));
      } else {
        handlePropertyResult(r, payload, key, input, optin, optout);
      }
    }
    if (unrecognized.length) {
      payload.issues.push({
        code: "unrecognized_keys",
        keys: unrecognized,
        input,
        inst,
        // Describes the shape of the input, not the validity of the parsed value, so it never aborts. The parse still fails; the schema's own checks just get to run first, and an enclosing intersection can reconcile the key against a sibling operand.
        continue: true
      });
    }
    if (!proms.length)
      return payload;
    return Promise.all(proms).then(() => {
      return payload;
    });
  }
  const $ZodObject = /* @__PURE__ */ $constructor("$ZodObject", (inst, def) => {
    $ZodType.init(inst, def);
    const desc = Object.getOwnPropertyDescriptor(def, "shape");
    const sh = desc?.get ? desc.get.raw : def.shape ?? {};
    if (sh) {
      const get = () => {
        const newSh = { ...sh };
        Object.defineProperty(def, "shape", { value: newSh });
        get.raw = newSh;
        return newSh;
      };
      get.raw = sh;
      Object.defineProperty(def, "shape", { get });
    }
    const _normalized = cached(() => normalizeDef(def));
    defineLazyInternal(inst, "propValues", (zod) => {
      const shape = zod.def.shape;
      const propValues = {};
      for (const key in shape) {
        const field = shape[key]._zod;
        if (field.values) {
          if (!Object.prototype.hasOwnProperty.call(propValues, key)) {
            assignProp(propValues, key, /* @__PURE__ */ new Set());
          }
          for (const v of field.values)
            propValues[key].add(v);
          if (field.optin !== void 0)
            propValues[key].add(void 0);
        }
      }
      return propValues;
    });
    const isObject$1 = isObject;
    const catchall = def.catchall;
    let value;
    const memo2 = globalConfig.memoizer;
    memo2?.attach(inst);
    inst._zod.parse = (payload, ctx) => {
      value ?? (value = _normalized.value);
      const input = payload.value;
      if (!isObject$1(input)) {
        payload.issues.push({
          expected: "object",
          code: "invalid_type",
          input,
          inst
        });
        return payload;
      }
      payload.value = memo2 ? memo2.alloc(inst, payload, {}, ctx) : {};
      const proms = [];
      const shape = value.shape;
      const abortEarly = ctx?.abortEarly;
      let seen = payload.issues.length;
      for (const key of value.allKeys) {
        if (abortEarly && payload.issues.length !== seen) {
          if (aborted(payload, seen))
            break;
          seen = payload.issues.length;
        }
        if (key === "__proto__")
          continue;
        const el = shape[key];
        const optin = el._zod.optin;
        const optout = el._zod.optout;
        const r = el._zod.run({ value: input[key], issues: [] }, ctx);
        if (r instanceof Promise) {
          proms.push(r.then((r2) => handlePropertyResult(r2, payload, key, input, optin, optout)));
        } else {
          handlePropertyResult(r, payload, key, input, optin, optout);
        }
      }
      if (!catchall) {
        return proms.length ? Promise.all(proms).then(() => payload) : payload;
      }
      return handleCatchall(proms, input, payload, ctx, _normalized.value, inst, abortEarly === true);
    };
  });
  const $ZodObjectJIT = /* @__PURE__ */ $constructor("$ZodObjectJIT", (inst, def) => {
    $ZodObject.init(inst, def);
    const superParse = inst._zod.parse;
    const _normalized = cached(() => normalizeDef(def));
    const memo2 = globalConfig.memoizer;
    const generateFastpass = (shape) => {
      const normalized = _normalized.value;
      const syms = normalized.symbolKeys;
      const doc = new Doc(["payload", "ctx"], { shape, inst, memo: memo2, syms });
      const parseStr = (k) => `shape[${k}]._zod.run({ value: input[${k}], issues: [] }, ctx)`;
      const prefixStr = (id, k) => `
          let ${id}_ab = false;
          for (let i = 0; i < ${id}.issues.length; i++) {
            const iss = ${id}.issues[i];
            iss.path = iss.path ? [${k}, ...iss.path] : [${k}];
            payload.issues.push(iss);
            if (iss.continue !== true) ${id}_ab = true;
          }
          if (${id}_ab && ctx && ctx.abortEarly) {
            payload.value = newResult;
            return payload;
          }`;
      doc.write(`const input = payload.value;`);
      const ids = /* @__PURE__ */ Object.create(null);
      let counter = 0;
      for (const key of normalized.allKeys) {
        ids[key] = `key_${counter++}`;
      }
      doc.write(memo2 ? `const newResult = memo.alloc(inst, payload, {}, ctx);` : `const newResult = {};`);
      for (const key of normalized.allKeys) {
        if (key === "__proto__")
          continue;
        const id = ids[key];
        const k = typeof key === "symbol" ? `syms[${syms.indexOf(key)}]` : esc(key);
        const isPresent = `${k} in input`;
        const schema = shape[key];
        const optin = schema?._zod?.optin;
        const isOptionalIn = optin !== void 0;
        const isOptionalOut = schema?._zod?.optout === "optional";
        doc.write(`const ${id} = ${parseStr(k)};`);
        if (isOptionalIn && isOptionalOut) {
          const assign = optin === "optional" ? `${id}_present` : `${id}.value !== undefined || ${id}_present`;
          doc.write(`
        const ${id}_present = ${isPresent};
        if (!${id}.issues.length || ${id}_present) {
          if (${id}.issues.length) {${prefixStr(id, k)}
          }

          if (${assign}) {
            newResult[${k}] = ${id}.value;
          }
        }

      `);
        } else if (!isOptionalIn) {
          doc.write(`
        const ${id}_present = ${isPresent};
        if (${id}.issues.length) {${prefixStr(id, k)}
        }
        if (!${id}_present && !${id}.issues.length) {
          payload.issues.push({
            code: "invalid_type",
            expected: "nonoptional",
            input: undefined,
            path: [${k}]
          });
          if (ctx && ctx.abortEarly) {
            payload.value = newResult;
            return payload;
          }
        }

        if (${id}_present) {
          newResult[${k}] = ${id}.value;
        }

      `);
        } else {
          doc.write(`
        if (${id}.issues.length) {${prefixStr(id, k)}
        }
      `);
          if (optin === "defaulted") {
            doc.write(`newResult[${k}] = ${id}.value;`);
          } else {
            doc.write(`
        if (${id}.value !== undefined || ${isPresent}) {
          newResult[${k}] = ${id}.value;
        }
      `);
          }
        }
      }
      doc.write(`payload.value = newResult;`);
      doc.write(`return payload;`);
      return doc.compile();
    };
    let fastpass;
    const isObject$1 = isObject;
    const jit = !globalConfig.jitless;
    const allowsEval$1 = allowsEval;
    const fastEnabled = jit && allowsEval$1.value;
    const catchall = def.catchall;
    let value;
    inst._zod.parse = (payload, ctx) => {
      value ?? (value = _normalized.value);
      const input = payload.value;
      if (!isObject$1(input)) {
        payload.issues.push({
          expected: "object",
          code: "invalid_type",
          input,
          inst
        });
        return payload;
      }
      if (jit && fastEnabled && ctx?.async === false && ctx.jitless !== true) {
        if (!fastpass)
          fastpass = generateFastpass(def.shape);
        payload = fastpass(payload, ctx);
        if (!catchall)
          return payload;
        return handleCatchall([], input, payload, ctx, value, inst, ctx?.abortEarly === true);
      }
      return superParse(payload, ctx);
    };
  });
  function handleUnionResults(results, final, inst, ctx) {
    for (const result of results) {
      if (result.issues.length === 0) {
        final.value = result.value;
        return final;
      }
    }
    const nonaborted = results.filter((r) => !aborted(r));
    if (nonaborted.length === 1) {
      final.value = nonaborted[0].value;
      return nonaborted[0];
    }
    final.issues.push({
      code: "invalid_union",
      input: final.value,
      inst,
      errors: results.map((result) => result.issues.map((iss) => finalizeIssue(iss, ctx, config())))
    });
    return final;
  }
  const $ZodUnion = /* @__PURE__ */ $constructor("$ZodUnion", (inst, def) => {
    $ZodType.init(inst, def);
    defineLazyInternal(inst, "optin", (zod) => zod.def.options.some((o) => o._zod.optin === "defaulted") ? "defaulted" : zod.def.options.some((o) => o._zod.optin !== void 0) ? "optional" : void 0);
    defineLazyInternal(inst, "optout", (zod) => zod.def.options.some((o) => o._zod.optout === "optional") ? "optional" : void 0);
    defineLazyInternal(inst, "values", (zod) => {
      if (zod.def.options.every((o) => o._zod.values)) {
        return new Set(zod.def.options.flatMap((option) => Array.from(option._zod.values)));
      }
      return void 0;
    });
    defineLazyInternal(inst, "pattern", (zod) => {
      if (zod.def.options.every((o) => o._zod.pattern)) {
        const patterns = zod.def.options.map((o) => o._zod.pattern);
        return new RegExp(`^(${patterns.map((p) => cleanRegex(p.source)).join("|")})$`);
      }
      return void 0;
    });
    const first = def.options.length === 1 ? def.options[0]._zod.run : null;
    inst._zod.parse = (payload, ctx) => {
      if (first) {
        return first(payload, ctx);
      }
      let async = false;
      const results = [];
      for (const option of def.options) {
        const result = option._zod.run({
          value: payload.value,
          issues: []
        }, ctx);
        if (result instanceof Promise) {
          results.push(result);
          async = true;
        } else {
          if (result.issues.length === 0)
            return result;
          results.push(result);
        }
      }
      if (!async)
        return handleUnionResults(results, payload, inst, ctx);
      return Promise.all(results).then((results2) => {
        return handleUnionResults(results2, payload, inst, ctx);
      });
    };
  });
  function discriminatorMap(def) {
    const map = /* @__PURE__ */ new Map();
    for (const option of def.options) {
      const values = option._zod.propValues?.[def.discriminator];
      if (!values || values.size === 0)
        throw new Error(`Invalid discriminated union option at index "${def.options.indexOf(option)}"`);
      for (const value of values) {
        if (map.has(value)) {
          if (value !== void 0)
            throw new Error(`Duplicate discriminator value "${String(value)}"`);
          map.set(value, null);
        } else {
          map.set(value, option);
        }
      }
    }
    return map;
  }
  const $ZodDiscriminatedUnion = /* @__PURE__ */ $constructor("$ZodDiscriminatedUnion", (inst, def) => {
    def.inclusive = false;
    $ZodUnion.init(inst, def);
    const _super = inst._zod.parse;
    defineLazyInternal(inst, "propValues", (zod) => {
      const propValues = {};
      let undefinedCount = 0;
      for (const option of zod.def.options) {
        const pv = option._zod.propValues;
        if (!pv || Object.keys(pv).length === 0)
          throw new Error(`Invalid discriminated union option at index "${zod.def.options.indexOf(option)}"`);
        if (pv[zod.def.discriminator]?.has(void 0))
          undefinedCount++;
        for (const [k, v] of Object.entries(pv)) {
          if (!Object.prototype.hasOwnProperty.call(propValues, k)) {
            assignProp(propValues, k, /* @__PURE__ */ new Set());
          }
          for (const val of v) {
            propValues[k].add(val);
          }
        }
      }
      if (!zod.def.unionFallback && undefinedCount > 1)
        propValues[zod.def.discriminator]?.delete(void 0);
      return propValues;
    });
    def.options.forEach((option, i) => {
      const propShape = rawShape(option._zod.def);
      if (propShape && !Object.prototype.hasOwnProperty.call(propShape, def.discriminator)) {
        throw new Error(`Invalid discriminated union option at index "${i}"`);
      }
    });
    const disc = cached(() => discriminatorMap(def));
    inst._zod.parse = (payload, ctx) => {
      const input = payload.value;
      if (!isObject(input)) {
        payload.issues.push({
          code: "invalid_type",
          expected: "object",
          input,
          inst
        });
        return payload;
      }
      const value = input?.[def.discriminator];
      const opt = disc.value.get(value);
      if (opt && (value !== void 0 || ctx.direction !== "backward")) {
        return opt._zod.run(payload, ctx);
      }
      if (def.unionFallback || ctx.direction === "backward") {
        return _super(payload, ctx);
      }
      payload.issues.push({
        code: "invalid_union",
        errors: [],
        note: "No matching discriminator",
        discriminator: def.discriminator,
        options: Array.from(disc.value.keys()).filter((value2) => disc.value.get(value2) !== null),
        input,
        path: [def.discriminator],
        inst
      });
      return payload;
    };
  });
  const $ZodIntersection = /* @__PURE__ */ $constructor("$ZodIntersection", (inst, def) => {
    $ZodType.init(inst, def);
    inst._zod.parse = (payload, ctx) => {
      const input = payload.value;
      const left = def.left._zod.run({ value: input, issues: [] }, ctx);
      const right = def.right._zod.run({ value: input, issues: [] }, ctx);
      const async = left instanceof Promise || right instanceof Promise;
      if (async) {
        return Promise.all([left, right]).then(([left2, right2]) => {
          return handleIntersectionResults(payload, left2, right2);
        });
      }
      return handleIntersectionResults(payload, left, right);
    };
  });
  function mergeValues(a, b) {
    if (a === b) {
      return { valid: true, data: a };
    }
    if (a instanceof Date && b instanceof Date && +a === +b) {
      return { valid: true, data: a };
    }
    if (isPlainObject(a) && isPlainObject(b)) {
      const bKeys = Object.keys(b);
      const sharedKeys = Object.keys(a).filter((key) => bKeys.indexOf(key) !== -1);
      const newObj = { ...a, ...b };
      if (Object.prototype.hasOwnProperty.call(newObj, "__proto__"))
        delete newObj.__proto__;
      for (const key of sharedKeys) {
        if (key === "__proto__")
          continue;
        const sharedValue = mergeValues(a[key], b[key]);
        if (!sharedValue.valid) {
          return {
            valid: false,
            mergeErrorPath: [key, ...sharedValue.mergeErrorPath]
          };
        }
        newObj[key] = sharedValue.data;
      }
      return { valid: true, data: newObj };
    }
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) {
        return { valid: false, mergeErrorPath: [] };
      }
      const newArray = [];
      for (let index = 0; index < a.length; index++) {
        const itemA = a[index];
        const itemB = b[index];
        const sharedValue = mergeValues(itemA, itemB);
        if (!sharedValue.valid) {
          return {
            valid: false,
            mergeErrorPath: [index, ...sharedValue.mergeErrorPath]
          };
        }
        newArray.push(sharedValue.data);
      }
      return { valid: true, data: newArray };
    }
    return { valid: false, mergeErrorPath: [] };
  }
  function handleIntersectionResults(result, left, right) {
    const unrecKeys = /* @__PURE__ */ new Map();
    let unrecIssue;
    const keyIssues = /* @__PURE__ */ new Map();
    const collect = (iss, side) => {
      let keys;
      if (iss.code === "unrecognized_keys" && !iss.path?.length) {
        unrecIssue ?? (unrecIssue = iss);
        keys = iss.keys;
      } else if (iss.code === "invalid_key" && iss.origin === "record" && iss.path?.length === 1) {
        const k = String(iss.path[0]);
        if (!keyIssues.has(k))
          keyIssues.set(k, iss);
        keys = [k];
      } else {
        return false;
      }
      for (const k of keys) {
        if (!unrecKeys.has(k))
          unrecKeys.set(k, {});
        unrecKeys.get(k)[side] = true;
      }
      return true;
    };
    for (const iss of left.issues) {
      if (!collect(iss, "l"))
        result.issues.push(iss);
    }
    for (const iss of right.issues) {
      if (!collect(iss, "r"))
        result.issues.push(iss);
    }
    const bothKeys = [...unrecKeys].filter(([, f]) => f.l && f.r).map(([k]) => k);
    if (bothKeys.length) {
      const aggregated = unrecIssue ? bothKeys.filter((k) => unrecIssue.keys.includes(k)) : [];
      if (aggregated.length)
        result.issues.push({ ...unrecIssue, keys: aggregated });
      for (const k of bothKeys) {
        if (!aggregated.includes(k) && keyIssues.has(k))
          result.issues.push(keyIssues.get(k));
      }
    }
    const merged = mergeValues(left.value, right.value);
    if (!merged.valid) {
      if (aborted(result))
        return result;
      throw new Error(`Unmergable intersection. Error path: ${JSON.stringify(merged.mergeErrorPath)}`);
    }
    result.value = merged.data;
    return result;
  }
  const $ZodTuple = /* @__PURE__ */ $constructor("$ZodTuple", (inst, def) => {
    $ZodType.init(inst, def);
    const items = def.items;
    const memo2 = globalConfig.memoizer;
    memo2?.attach(inst);
    inst._zod.parse = (payload, ctx) => {
      const input = payload.value;
      if (!Array.isArray(input)) {
        payload.issues.push({
          input,
          inst,
          expected: "tuple",
          code: "invalid_type"
        });
        return payload;
      }
      payload.value = memo2 ? memo2.alloc(inst, payload, [], ctx) : [];
      const proms = [];
      const optinStart = getTupleOptStart(items, "optin");
      const optoutStart = getTupleOptStart(items, "optout");
      if (!def.rest) {
        if (input.length < optinStart) {
          payload.issues.push({
            code: "too_small",
            minimum: optinStart,
            inclusive: true,
            input,
            inst,
            origin: "array"
          });
          return payload;
        }
        if (input.length > items.length) {
          payload.issues.push({
            code: "too_big",
            maximum: items.length,
            inclusive: true,
            input,
            inst,
            origin: "array"
          });
        }
      }
      const itemResults = new Array(items.length);
      const abortEarly = def.rest ? ctx?.abortEarly : void 0;
      let itemAborted = false;
      for (let i = 0; i < items.length; i++) {
        const r = items[i]._zod.run({ value: input[i], issues: [] }, ctx);
        if (r instanceof Promise) {
          proms.push(r.then((rr) => {
            itemResults[i] = rr;
          }));
        } else {
          itemResults[i] = r;
          if (abortEarly && !itemAborted && r.issues.length)
            itemAborted = aborted(r);
        }
      }
      if (def.rest && !itemAborted) {
        let i = items.length - 1;
        const rest = input.slice(items.length);
        let seen = payload.issues.length;
        for (const el of rest) {
          if (abortEarly && payload.issues.length !== seen) {
            if (aborted(payload, seen))
              break;
            seen = payload.issues.length;
          }
          i++;
          const result = def.rest._zod.run({ value: el, issues: [] }, ctx);
          if (result instanceof Promise) {
            proms.push(result.then((r) => handleTupleResult(r, payload, i)));
          } else {
            handleTupleResult(result, payload, i);
          }
        }
      }
      if (proms.length) {
        return Promise.all(proms).then(() => handleTupleResults(itemResults, payload, items, input, optoutStart));
      }
      return handleTupleResults(itemResults, payload, items, input, optoutStart);
    };
  });
  function getTupleOptStart(items, key) {
    for (let i = items.length - 1; i >= 0; i--) {
      const omittable = key === "optin" ? items[i]._zod.optin !== void 0 : items[i]._zod.optout === "optional";
      if (!omittable)
        return i + 1;
    }
    return 0;
  }
  function handleTupleResult(result, final, index) {
    if (result.issues.length) {
      final.issues.push(...prefixIssues(index, result.issues));
    }
    final.value[index] = result.value;
  }
  function handleTupleResults(itemResults, final, items, input, optoutStart) {
    for (let i = 0; i < items.length; i++) {
      const r = itemResults[i];
      const isPresent = i < input.length;
      if (!isPresent && i >= optoutStart && items[i]._zod.optin === "optional") {
        final.value.length = i;
        break;
      }
      if (r.issues.length) {
        if (!isPresent && i >= optoutStart) {
          final.value.length = i;
          break;
        }
        final.issues.push(...prefixIssues(i, r.issues));
      }
      final.value[i] = r.value;
    }
    for (let i = final.value.length - 1; i >= input.length; i--) {
      if (items[i]._zod.optout === "optional" && final.value[i] === void 0) {
        final.value.length = i;
      } else {
        break;
      }
    }
    return final;
  }
  const $ZodRecord = /* @__PURE__ */ $constructor("$ZodRecord", (inst, def) => {
    $ZodType.init(inst, def);
    const memo2 = globalConfig.memoizer;
    memo2?.attach(inst);
    inst._zod.parse = (payload, ctx) => {
      const input = payload.value;
      if (!isPlainObject(input)) {
        payload.issues.push({
          expected: "record",
          code: "invalid_type",
          input,
          inst
        });
        return payload;
      }
      const proms = [];
      const values = def.keyType._zod.values;
      if (values && !def.partial) {
        payload.value = memo2 ? memo2.alloc(inst, payload, {}, ctx) : {};
        const recordKeys = /* @__PURE__ */ new Set();
        for (const key of values) {
          if (typeof key === "string" || typeof key === "number" || typeof key === "symbol") {
            recordKeys.add(typeof key === "number" ? key.toString() : key);
            if (key === "__proto__")
              continue;
            const keyResult = def.keyType._zod.run({ value: key, issues: [] }, ctx);
            if (keyResult instanceof Promise) {
              throw new Error("Async schemas not supported in object keys currently");
            }
            if (keyResult.issues.length) {
              payload.issues.push({
                code: "invalid_key",
                origin: "record",
                issues: keyResult.issues.map((iss) => finalizeIssue(iss, ctx, config())),
                input: key,
                path: [key],
                inst
              });
              continue;
            }
            const outKey = keyResult.value;
            if (outKey === "__proto__")
              continue;
            const result = def.valueType._zod.run({ value: input[key], issues: [] }, ctx);
            if (result instanceof Promise) {
              proms.push(result.then((result2) => {
                if (result2.issues.length) {
                  payload.issues.push(...prefixIssues(key, result2.issues));
                }
                payload.value[outKey] = result2.value;
              }));
            } else {
              if (result.issues.length) {
                payload.issues.push(...prefixIssues(key, result.issues));
              }
              payload.value[outKey] = result.value;
            }
          }
        }
        let unrecognized;
        for (const key in input) {
          if (!recordKeys.has(key)) {
            if (def.mode === "loose") {
              if (key === "__proto__")
                continue;
              payload.value[key] = input[key];
            } else {
              unrecognized = unrecognized ?? [];
              unrecognized.push(key);
            }
          }
        }
        if (unrecognized && unrecognized.length > 0) {
          payload.issues.push({
            code: "unrecognized_keys",
            input,
            inst,
            keys: unrecognized,
            continue: true
          });
        }
      } else {
        payload.value = memo2 ? memo2.alloc(inst, payload, {}, ctx) : {};
        let unrecognized;
        for (const key of Reflect.ownKeys(input)) {
          if (key === "__proto__")
            continue;
          if (!Object.prototype.propertyIsEnumerable.call(input, key))
            continue;
          let keyResult = def.keyType._zod.run({ value: key, issues: [] }, ctx);
          if (keyResult instanceof Promise) {
            throw new Error("Async schemas not supported in object keys currently");
          }
          const checkNumericKey = typeof key === "string" && number$1.test(key) && keyResult.issues.length;
          if (checkNumericKey) {
            const retryResult = def.keyType._zod.run({ value: Number(key), issues: [] }, ctx);
            if (retryResult instanceof Promise) {
              throw new Error("Async schemas not supported in object keys currently");
            }
            if (retryResult.issues.length === 0) {
              keyResult = retryResult;
            }
          }
          if (keyResult.issues.length) {
            if (def.mode === "loose") {
              payload.value[key] = input[key];
            } else if (values) {
              unrecognized = unrecognized ?? [];
              unrecognized.push(key);
            } else {
              payload.issues.push({
                code: "invalid_key",
                origin: "record",
                issues: keyResult.issues.map((iss) => finalizeIssue(iss, ctx, config())),
                input: key,
                path: [key],
                inst
              });
            }
            continue;
          }
          const outKey = keyResult.value;
          if (outKey === "__proto__")
            continue;
          const result = def.valueType._zod.run({ value: input[key], issues: [] }, ctx);
          if (result instanceof Promise) {
            proms.push(result.then((result2) => {
              if (result2.issues.length) {
                payload.issues.push(...prefixIssues(key, result2.issues));
              }
              payload.value[outKey] = result2.value;
            }));
          } else {
            if (result.issues.length) {
              payload.issues.push(...prefixIssues(key, result.issues));
            }
            payload.value[outKey] = result.value;
          }
        }
        if (unrecognized && unrecognized.length > 0) {
          payload.issues.push({
            code: "unrecognized_keys",
            input,
            inst,
            keys: unrecognized,
            continue: true
          });
        }
      }
      if (proms.length) {
        return Promise.all(proms).then(() => payload);
      }
      return payload;
    };
  });
  const $ZodEnum = /* @__PURE__ */ $constructor("$ZodEnum", (inst, def) => {
    $ZodType.init(inst, def);
    const values = getEnumValues(def.entries);
    const valuesSet = new Set(values);
    inst._zod.values = valuesSet;
    defineLazyInternal(inst, "pattern", (zod) => {
      const patternValues = getEnumValues(zod.def.entries).filter((k) => propertyKeyTypes.has(typeof k));
      return new RegExp(patternValues.length ? `^(${patternValues.map((o) => escapeRegex(o.toString())).join("|")})$` : "^[^\\s\\S]$");
    });
    inst._zod.parse = (payload, _ctx) => {
      const input = payload.value;
      if (valuesSet.has(input)) {
        return payload;
      }
      payload.issues.push({
        code: "invalid_value",
        values,
        input,
        inst
      });
      return payload;
    };
  });
  const $ZodLiteral = /* @__PURE__ */ $constructor("$ZodLiteral", (inst, def) => {
    $ZodType.init(inst, def);
    const values = new Set(def.values);
    inst._zod.values = values;
    defineLazyInternal(inst, "pattern", (zod) => {
      const vals = zod.def.values;
      return new RegExp(vals.length ? `^(${vals.map((o) => typeof o === "string" ? escapeRegex(o) : o ? escapeRegex(o.toString()) : String(o)).join("|")})$` : "^[^\\s\\S]$");
    });
    inst._zod.parse = (payload, _ctx) => {
      const input = payload.value;
      if (values.has(input)) {
        return payload;
      }
      payload.issues.push({
        code: "invalid_value",
        values: def.values,
        input,
        inst
      });
      return payload;
    };
  });
  const $ZodTransform = /* @__PURE__ */ $constructor("$ZodTransform", (inst, def) => {
    $ZodType.init(inst, def);
    inst._zod.optin = "optional";
    globalConfig.memoizer?.guard(inst);
    inst._zod.parse = (payload, ctx) => {
      if (ctx.direction === "backward") {
        throw new $ZodEncodeError(inst.constructor.name);
      }
      const _out = def.transform(payload.value, payload);
      if (ctx.async) {
        const output = _out instanceof Promise ? _out : Promise.resolve(_out);
        return output.then((output2) => {
          payload.value = output2;
          return payload;
        });
      }
      if (_out instanceof Promise) {
        throw new $ZodAsyncError();
      }
      payload.value = _out;
      return payload;
    };
  });
  function handleOptionalResult(payload, result) {
    payload.value = result.issues.length ? void 0 : result.value;
    return payload;
  }
  const $ZodOptional = /* @__PURE__ */ $constructor("$ZodOptional", (inst, def) => {
    $ZodType.init(inst, def);
    defineLazyInternal(inst, "optin", (zod) => zod.def.innerType._zod.optin === "defaulted" ? "defaulted" : "optional");
    inst._zod.optout = "optional";
    defineLazyInternal(inst, "values", (zod) => {
      const values = zod.def.innerType._zod.values;
      return values ? /* @__PURE__ */ new Set([...values, void 0]) : void 0;
    });
    defineLazyInternal(inst, "pattern", (zod) => {
      const pattern = zod.def.innerType._zod.pattern;
      return pattern ? new RegExp(`^(${cleanRegex(pattern.source)})?$`) : void 0;
    });
    inst._zod.parse = (payload, ctx) => {
      if (payload.value === void 0) {
        if (def.innerType._zod.optin !== "defaulted")
          return payload;
        const result = def.innerType._zod.run({ value: payload.value, issues: [] }, ctx);
        if (result instanceof Promise)
          return result.then((result2) => handleOptionalResult(payload, result2));
        return handleOptionalResult(payload, result);
      }
      return def.innerType._zod.run(payload, ctx);
    };
  });
  const $ZodExactOptional = /* @__PURE__ */ $constructor("$ZodExactOptional", (inst, def) => {
    $ZodOptional.init(inst, def);
    defineLazyInternal(inst, "values", (zod) => zod.def.innerType._zod.values);
    defineLazyInternal(inst, "pattern", (zod) => zod.def.innerType._zod.pattern);
    inst._zod.parse = (payload, ctx) => {
      return def.innerType._zod.run(payload, ctx);
    };
  });
  const $ZodNullable = /* @__PURE__ */ $constructor("$ZodNullable", (inst, def) => {
    $ZodType.init(inst, def);
    defineLazyInternal(inst, "optin", (zod) => zod.def.innerType._zod.optin);
    defineLazyInternal(inst, "optout", (zod) => zod.def.innerType._zod.optout);
    defineLazyInternal(inst, "pattern", (zod) => {
      const pattern = zod.def.innerType._zod.pattern;
      return pattern ? new RegExp(`^(${cleanRegex(pattern.source)}|null)$`) : void 0;
    });
    defineLazyInternal(inst, "values", (zod) => {
      return zod.def.innerType._zod.values ? /* @__PURE__ */ new Set([...zod.def.innerType._zod.values, null]) : void 0;
    });
    inst._zod.parse = (payload, ctx) => {
      if (payload.value === null)
        return payload;
      return def.innerType._zod.run(payload, ctx);
    };
  });
  const $ZodDefault = /* @__PURE__ */ $constructor("$ZodDefault", (inst, def) => {
    $ZodType.init(inst, def);
    inst._zod.optin = "defaulted";
    defineLazyInternal(inst, "values", (zod) => zod.def.innerType._zod.values);
    inst._zod.parse = (payload, ctx) => {
      if (ctx.direction === "backward") {
        return def.innerType._zod.run(payload, ctx);
      }
      if (payload.value === void 0) {
        payload.value = def.defaultValue;
        return payload;
      }
      const result = def.innerType._zod.run(payload, ctx);
      if (result instanceof Promise) {
        return result.then((result2) => handleDefaultResult(result2, def));
      }
      return handleDefaultResult(result, def);
    };
  });
  function handleDefaultResult(payload, def) {
    if (payload.value === void 0) {
      payload.value = def.defaultValue;
    }
    return payload;
  }
  const $ZodPrefault = /* @__PURE__ */ $constructor("$ZodPrefault", (inst, def) => {
    $ZodType.init(inst, def);
    inst._zod.optin = "defaulted";
    defineLazyInternal(inst, "values", (zod) => zod.def.innerType._zod.values);
    inst._zod.parse = (payload, ctx) => {
      if (ctx.direction === "backward") {
        return def.innerType._zod.run(payload, ctx);
      }
      if (payload.value === void 0) {
        payload.value = def.defaultValue;
      }
      return def.innerType._zod.run(payload, ctx);
    };
  });
  const $ZodNonOptional = /* @__PURE__ */ $constructor("$ZodNonOptional", (inst, def) => {
    $ZodType.init(inst, def);
    defineLazyInternal(inst, "values", (zod) => {
      const v = zod.def.innerType._zod.values;
      return v ? new Set([...v].filter((x) => x !== void 0)) : void 0;
    });
    inst._zod.parse = (payload, ctx) => {
      const result = def.innerType._zod.run(payload, ctx);
      if (result instanceof Promise) {
        return result.then((result2) => handleNonOptionalResult(result2, inst));
      }
      return handleNonOptionalResult(result, inst);
    };
  });
  function handleNonOptionalResult(payload, inst) {
    if (!payload.issues.length && payload.value === void 0) {
      payload.issues.push({
        code: "invalid_type",
        expected: "nonoptional",
        input: payload.value,
        inst
      });
    }
    return payload;
  }
  function handleCatchResult(payload, result, def, ctx) {
    if (!result.issues.length) {
      payload.value = result.value;
      if (result.memo)
        payload.memo = true;
      return payload;
    }
    payload.value = def.catchValue({
      ...result,
      value: payload.value,
      error: {
        issues: result.issues.map((iss) => finalizeIssue(iss, ctx, config()))
      },
      input: payload.value
    });
    return payload;
  }
  const $ZodCatch = /* @__PURE__ */ $constructor("$ZodCatch", (inst, def) => {
    $ZodType.init(inst, def);
    defineLazyInternal(inst, "optin", (zod) => zod.def.innerType._zod.optin === "defaulted" ? "defaulted" : "optional");
    defineLazyInternal(inst, "optout", (zod) => zod.def.innerType._zod.optout);
    defineLazyInternal(inst, "values", (zod) => zod.def.innerType._zod.values);
    inst._zod.parse = (payload, ctx) => {
      if (ctx.direction === "backward") {
        return def.innerType._zod.run(payload, ctx);
      }
      const result = def.innerType._zod.run({ value: payload.value, issues: [] }, ctx);
      if (result instanceof Promise) {
        return result.then((result2) => handleCatchResult(payload, result2, def, ctx));
      }
      return handleCatchResult(payload, result, def, ctx);
    };
  });
  const $ZodPipe = /* @__PURE__ */ $constructor("$ZodPipe", (inst, def) => {
    $ZodType.init(inst, def);
    defineLazyInternal(inst, "values", (zod) => zod.def.in._zod.values);
    defineLazyInternal(inst, "optin", (zod) => zod.def.in._zod.optin);
    defineLazyInternal(inst, "optout", (zod) => zod.def.out._zod.optout);
    defineLazyInternal(inst, "propValues", (zod) => zod.def.in._zod.propValues);
    inst._zod.parse = (payload, ctx) => {
      if (ctx.direction === "backward") {
        const right = def.out._zod.run(payload, ctx);
        if (right instanceof Promise) {
          return right.then((right2) => handlePipeResult(right2, def.in, ctx));
        }
        return handlePipeResult(right, def.in, ctx);
      }
      const left = def.in._zod.run(payload, ctx);
      if (left instanceof Promise) {
        return left.then((left2) => handlePipeResult(left2, def.out, ctx));
      }
      return handlePipeResult(left, def.out, ctx);
    };
  });
  function handlePipeResult(left, next, ctx) {
    if (left.issues.some((iss) => iss.code !== "unrecognized_keys")) {
      left.aborted = true;
      return left;
    }
    return next._zod.run({ value: left.value, issues: left.issues }, ctx);
  }
  const $ZodReadonly = /* @__PURE__ */ $constructor("$ZodReadonly", (inst, def) => {
    $ZodType.init(inst, def);
    defineLazyInternal(inst, "propValues", (zod) => zod.def.innerType._zod.propValues);
    defineLazyInternal(inst, "values", (zod) => zod.def.innerType._zod.values);
    defineLazyInternal(inst, "optin", (zod) => zod.def.innerType?._zod?.optin);
    defineLazyInternal(inst, "optout", (zod) => zod.def.innerType?._zod?.optout);
    inst._zod.parse = (payload, ctx) => {
      if (ctx.direction === "backward") {
        return def.innerType._zod.run(payload, ctx);
      }
      const result = def.innerType._zod.run(payload, ctx);
      if (result instanceof Promise) {
        return result.then(handleReadonlyResult);
      }
      return handleReadonlyResult(result);
    };
  });
  function handleReadonlyResult(payload) {
    if (!payload.memo)
      payload.value = Object.freeze(payload.value);
    return payload;
  }
  const $ZodCustom = /* @__PURE__ */ $constructor("$ZodCustom", (inst, def) => {
    $ZodCheck.init(inst, def);
    $ZodType.init(inst, def);
    inst._zod.parse = (payload, _) => {
      return payload;
    };
    inst._zod.check = (payload) => {
      const input = payload.value;
      const r = def.fn(input);
      if (r instanceof Promise) {
        return r.then((r2) => handleRefineResult(r2, payload, input, inst));
      }
      handleRefineResult(r, payload, input, inst);
      return;
    };
  });
  function handleRefineResult(result, payload, input, inst) {
    if (!result) {
      const _iss = {
        code: "custom",
        input,
        inst,
        // incorporates params.error into issue reporting
        path: [...inst._zod.def.path ?? []],
        // incorporates params.error into issue reporting
        continue: !inst._zod.def.abort
        // params: inst._zod.def.params,
      };
      if (inst._zod.def.params)
        _iss.params = inst._zod.def.params;
      payload.issues.push(issue(_iss));
    }
  }
  class $ZodCyclicError extends Error {
    constructor() {
      super(`Cannot parse a reference cycle that closes through a transform`);
      this.name = "ZodCyclicError";
    }
  }
  const STATE = "~memo";
  const NO_ISSUES = [];
  function isRef(value) {
    return value !== null && typeof value === "object";
  }
  function cloneIssues(issues) {
    return issues.map((iss) => iss.path ? { ...iss, path: iss.path.slice() } : { ...iss });
  }
  const recursive = /* @__PURE__ */ new WeakMap();
  const NONE = 0;
  const ASSUMED = 1;
  const PROVEN = 2;
  function isRecursive(inst, stack, resolve) {
    const cached2 = recursive.get(inst);
    if (cached2 !== void 0)
      return cached2 ? PROVEN : NONE;
    if (stack.has(inst))
      return PROVEN;
    stack.add(inst);
    let result = NONE;
    const check = (child) => {
      if (result !== PROVEN && child?._zod) {
        const answer = isRecursive(child, stack);
        if (answer > result)
          result = answer;
      }
    };
    const shape = (sh, spread) => {
      let answer = NONE;
      for (const key of Reflect.ownKeys(sh)) {
        const desc = Object.getOwnPropertyDescriptor(sh, key);
        if (!desc.enumerable)
          continue;
        const child = desc.get ? ASSUMED : desc.value?._zod ? isRecursive(desc.value, stack) : NONE;
        if (child > answer)
          answer = child;
      }
      return answer;
    };
    const merge2 = (answer) => {
      if (answer > result)
        result = answer;
    };
    const def = inst._zod.def;
    const kind = def.type;
    switch (kind) {
      case "object": {
        const raw = rawShape(def);
        merge2(raw ? shape(raw) : ASSUMED);
        check(def.catchall);
        break;
      }
      case "array":
        check(def.element);
        break;
      case "tuple":
        for (const el of def.items)
          check(el);
        check(def.rest);
        break;
      case "record":
      case "map":
        check(def.keyType);
        check(def.valueType);
        break;
      case "set":
        check(def.valueType);
        break;
      case "union":
        for (const el of def.options)
          check(el);
        break;
      case "intersection":
        check(def.left);
        check(def.right);
        break;
      case "optional":
      case "nullable":
      case "default":
      case "prefault":
      case "catch":
      case "readonly":
      case "nonoptional":
      case "promise":
      case "success":
        check(def.innerType);
        break;
      case "pipe":
        check(def.in);
        check(def.out);
        break;
      case "function":
        check(def.input);
        check(def.output);
        break;
      // `$ZodLazy` caches its inner on the def, so a resolved edge is followed exactly
      case "lazy": {
        const inner = def._cachedInner ?? void 0;
        merge2(inner ? isRecursive(inner, stack) : ASSUMED);
        break;
      }
      // a leaf by choice: `parts` are regex fragments, not data positions
      case "template_literal":
      // leaves
      case "string":
      case "number":
      case "int":
      case "boolean":
      case "bigint":
      case "symbol":
      case "undefined":
      case "null":
      case "void":
      case "never":
      case "any":
      case "unknown":
      case "date":
      case "nan":
      case "enum":
      case "literal":
      case "file":
      case "transform":
      case "custom":
        break;
      default: {
        for (const key in def) {
          const desc = Object.getOwnPropertyDescriptor(def, key);
          if (!desc || desc.get)
            continue;
          const value = desc.value;
          if (!value || typeof value !== "object")
            continue;
          if (value._zod)
            check(value);
          else if (Array.isArray(value))
            for (const el of value)
              check(el);
        }
      }
    }
    stack.delete(inst);
    return settle(inst, result);
  }
  function settle(inst, answer) {
    if (answer !== ASSUMED)
      recursive.set(inst, answer === PROVEN);
    return answer;
  }
  function bucketFor(state, inst) {
    let bucket = state.buckets.get(inst);
    if (!bucket) {
      bucket = /* @__PURE__ */ new WeakMap();
      state.buckets.set(inst, bucket);
    }
    return bucket;
  }
  let handoff;
  const open = [];
  const memo = {
    alloc(_inst, payload, empty) {
      const bucket = handoff;
      if (!bucket)
        return empty;
      handoff = void 0;
      const entry = { value: empty, issues: null };
      bucket.set(payload.value, entry);
      open.push(entry);
      return empty;
    },
    guard(inst) {
      var _a2;
      (_a2 = inst._zod).deferred ?? (_a2.deferred = []);
      inst._zod.deferred.push(() => {
        const base = inst._zod.parse;
        const wrapped = (payload, ctx) => {
          if (ctx.direction !== "backward" && isBackEdge(ctx, payload.value))
            throw new $ZodCyclicError();
          return base(payload, ctx);
        };
        inst._zod.parse = wrapped;
        if (inst._zod.run === base)
          inst._zod.run = wrapped;
      });
    },
    attach(inst) {
      var _a2;
      let isRecursiveInst;
      let rechecked = false;
      let lastCtx;
      let lastBucket;
      (_a2 = inst._zod).deferred ?? (_a2.deferred = []);
      inst._zod.deferred.push(() => {
        const base = inst._zod.parse;
        const wrapped = (payload, ctx) => {
          if (isRecursiveInst === void 0) {
            const walked = isRecursive(inst, /* @__PURE__ */ new Set());
            if (walked === NONE) {
              inst._zod.parse = base;
              if (inst._zod.run === wrapped)
                inst._zod.run = base;
              return base(payload, ctx);
            }
            if (walked === PROVEN || rechecked)
              isRecursiveInst = true;
            else
              rechecked = true;
          }
          const input = payload.value;
          if (!isRef(input))
            return base(payload, ctx);
          let state = ctx[STATE];
          if (!state) {
            state = { buckets: /* @__PURE__ */ new WeakMap(), backEdges: void 0 };
            ctx[STATE] = state;
          }
          let bucket;
          if (lastCtx === ctx) {
            bucket = lastBucket;
          } else {
            bucket = bucketFor(state, inst);
            lastCtx = ctx;
            lastBucket = bucket;
          }
          const hit = bucket.get(input);
          if (hit) {
            payload.value = hit.value;
            if (hit.issues) {
              if (hit.issues.length)
                payload.issues.push(...cloneIssues(hit.issues));
            } else {
              payload.memo = true;
              state.backEdges ?? (state.backEdges = /* @__PURE__ */ new WeakSet());
              state.backEdges.add(hit.value);
            }
            return payload;
          }
          handoff = bucket;
          const depth = open.length;
          const result = base(payload, ctx);
          handoff = void 0;
          const entry = open.length > depth ? open.pop() : void 0;
          if (result instanceof Promise) {
            return result.then((r) => {
              if (entry)
                entry.issues = r.issues.length ? cloneIssues(r.issues) : NO_ISSUES;
              return r;
            });
          }
          if (entry)
            entry.issues = result.issues.length ? cloneIssues(result.issues) : NO_ISSUES;
          return result;
        };
        inst._zod.parse = wrapped;
        if (inst._zod.run === base)
          inst._zod.run = wrapped;
      });
    }
  };
  function memoizer() {
    return memo;
  }
  function isBackEdge(ctx, value) {
    const backEdges = ctx[STATE]?.backEdges;
    return backEdges !== void 0 && isRef(value) && backEdges.has(value);
  }
  const error = () => {
    const Sizable = {
      string: { unit: "characters", verb: "to have" },
      file: { unit: "bytes", verb: "to have" },
      array: { unit: "items", verb: "to have" },
      set: { unit: "items", verb: "to have" },
      map: { unit: "entries", verb: "to have" }
    };
    function getSizing(origin) {
      return Sizable[origin] ?? null;
    }
    const FormatDictionary = {
      regex: "input",
      email: "email address",
      url: "URL",
      emoji: "emoji",
      uuid: "UUID",
      uuidv4: "UUIDv4",
      uuidv6: "UUIDv6",
      nanoid: "nanoid",
      guid: "GUID",
      cuid: "cuid",
      cuid2: "cuid2",
      ulid: "ULID",
      xid: "XID",
      ksuid: "KSUID",
      datetime: "ISO datetime",
      date: "ISO date",
      time: "ISO time",
      duration: "ISO duration",
      ipv4: "IPv4 address",
      ipv6: "IPv6 address",
      mac: "MAC address",
      cidrv4: "IPv4 range",
      cidrv6: "IPv6 range",
      base64: "base64-encoded string",
      base64url: "base64url-encoded string",
      json_string: "JSON string",
      e164: "E.164 number",
      currency_code: "currency code",
      credit_card: "credit card number",
      iban: "IBAN",
      jwt: "JWT",
      template_literal: "input"
    };
    const TypeDictionary = {
      // Compatibility: "nan" -> "NaN" for display
      nan: "NaN"
      // All other type names omitted - they fall back to raw values via ?? operator
    };
    function getTypeName(type, input) {
      if (type === "number" && typeof input === "number" && !Number.isFinite(input)) {
        return String(input);
      }
      return TypeDictionary[type] ?? type;
    }
    return (issue2) => {
      switch (issue2.code) {
        case "invalid_type": {
          const expected = getTypeName(issue2.expected);
          const receivedType = parsedType(issue2.input);
          const received = getTypeName(receivedType, issue2.input);
          return `Invalid input: expected ${expected}, received ${received}`;
        }
        case "invalid_value":
          if (issue2.values.length === 1)
            return `Invalid input: expected ${stringifyPrimitive(issue2.values[0])}`;
          return `Invalid option: expected one of ${joinValues(issue2.values, "|")}`;
        case "too_big": {
          const adj = issue2.exact ? "exactly " : issue2.inclusive ? "<=" : "<";
          const sizing = getSizing(issue2.origin);
          if (sizing)
            return `Too big: expected ${issue2.origin ?? "value"} to have ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "elements"}`;
          return `Too big: expected ${issue2.origin ?? "value"} to be ${adj}${issue2.maximum.toString()}`;
        }
        case "too_small": {
          const adj = issue2.exact ? "exactly " : issue2.inclusive ? ">=" : ">";
          const sizing = getSizing(issue2.origin);
          if (sizing) {
            return `Too small: expected ${issue2.origin} to have ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
          }
          return `Too small: expected ${issue2.origin} to be ${adj}${issue2.minimum.toString()}`;
        }
        case "invalid_format": {
          const _issue = issue2;
          if (_issue.format === "starts_with") {
            return `Invalid string: must start with "${_issue.prefix}"`;
          }
          if (_issue.format === "ends_with")
            return `Invalid string: must end with "${_issue.suffix}"`;
          if (_issue.format === "includes")
            return `Invalid string: must include "${_issue.includes}"`;
          if (_issue.format === "regex")
            return `Invalid string: must match pattern ${_issue.pattern}`;
          return `Invalid ${FormatDictionary[_issue.format] ?? issue2.format}`;
        }
        case "not_multiple_of":
          return `Invalid number: must be a multiple of ${issue2.divisor}`;
        case "unrecognized_keys":
          return `Unrecognized key${issue2.keys.length > 1 ? "s" : ""}: ${joinValues(issue2.keys, ", ")}`;
        case "invalid_key":
          return `Invalid key in ${issue2.origin}`;
        case "invalid_union":
          if (issue2.options && Array.isArray(issue2.options) && issue2.options.length > 0) {
            const opts = issue2.options.map((o) => `'${o}'`).join(" | ");
            return `Invalid discriminator value. Expected ${opts}`;
          }
          if (issue2.inclusive === false) {
            return "Invalid input: more than one option matched";
          }
          return "Invalid input";
        case "invalid_element":
          return `Invalid value in ${issue2.origin}`;
        default:
          return `Invalid input`;
      }
    };
  };
  function en() {
    return {
      localeError: error()
    };
  }
  var _a;
  class $ZodRegistry {
    constructor() {
      this._map = /* @__PURE__ */ new WeakMap();
      this._idmap = /* @__PURE__ */ new Map();
    }
    add(schema, ..._meta) {
      const meta = _meta[0];
      this._map.set(schema, meta);
      if (meta && typeof meta === "object" && "id" in meta) {
        this._idmap.set(meta.id, schema);
      }
      return this;
    }
    clear() {
      this._map = /* @__PURE__ */ new WeakMap();
      this._idmap = /* @__PURE__ */ new Map();
      return this;
    }
    remove(schema) {
      const meta = this._map.get(schema);
      if (meta && typeof meta === "object" && "id" in meta) {
        this._idmap.delete(meta.id);
      }
      this._map.delete(schema);
      return this;
    }
    get(schema) {
      const p = schema._zod.parent;
      if (p) {
        const pm = { ...this.get(p) ?? {} };
        delete pm.id;
        const f = { ...pm, ...this._map.get(schema) };
        return Object.keys(f).length ? f : void 0;
      }
      return this._map.get(schema);
    }
    has(schema) {
      return this._map.has(schema);
    }
  }
  function registry() {
    return new $ZodRegistry();
  }
  (_a = globalThis).__zod_globalRegistry ?? (_a.__zod_globalRegistry = registry());
  const globalRegistry = globalThis.__zod_globalRegistry;
  function snapshotChecks(def) {
    if (def.checks)
      def.checks = [...def.checks];
    return def;
  }
  // @__NO_SIDE_EFFECTS__
  function _string(Class, params) {
    return new Class(snapshotChecks({ type: "string", ...normalizeParams(params) }));
  }
  // @__NO_SIDE_EFFECTS__
  function _email(Class, params) {
    return new Class({
      type: "string",
      format: "email",
      check: "string_format",
      abort: false,
      ...normalizeParams(params)
    });
  }
  // @__NO_SIDE_EFFECTS__
  function _guid(Class, params) {
    return new Class({
      type: "string",
      format: "guid",
      check: "string_format",
      abort: false,
      ...normalizeParams(params)
    });
  }
  // @__NO_SIDE_EFFECTS__
  function _uuid(Class, params) {
    return new Class({
      type: "string",
      format: "uuid",
      check: "string_format",
      abort: false,
      ...normalizeParams(params)
    });
  }
  // @__NO_SIDE_EFFECTS__
  function _uuidv4(Class, params) {
    return new Class({
      type: "string",
      format: "uuid",
      check: "string_format",
      abort: false,
      version: "v4",
      ...normalizeParams(params)
    });
  }
  // @__NO_SIDE_EFFECTS__
  function _uuidv6(Class, params) {
    return new Class({
      type: "string",
      format: "uuid",
      check: "string_format",
      abort: false,
      version: "v6",
      ...normalizeParams(params)
    });
  }
  // @__NO_SIDE_EFFECTS__
  function _uuidv7(Class, params) {
    return new Class({
      type: "string",
      format: "uuid",
      check: "string_format",
      abort: false,
      version: "v7",
      ...normalizeParams(params)
    });
  }
  // @__NO_SIDE_EFFECTS__
  function _url(Class, params) {
    return new Class({
      type: "string",
      format: "url",
      check: "string_format",
      abort: false,
      ...normalizeParams(params)
    });
  }
  // @__NO_SIDE_EFFECTS__
  function _emoji(Class, params) {
    return new Class({
      type: "string",
      format: "emoji",
      check: "string_format",
      abort: false,
      ...normalizeParams(params)
    });
  }
  // @__NO_SIDE_EFFECTS__
  function _nanoid(Class, params) {
    return new Class({
      type: "string",
      format: "nanoid",
      check: "string_format",
      abort: false,
      ...normalizeParams(params)
    });
  }
  // @__NO_SIDE_EFFECTS__
  function _cuid(Class, params) {
    return new Class({
      type: "string",
      format: "cuid",
      check: "string_format",
      abort: false,
      ...normalizeParams(params)
    });
  }
  // @__NO_SIDE_EFFECTS__
  function _cuid2(Class, params) {
    return new Class({
      type: "string",
      format: "cuid2",
      check: "string_format",
      abort: false,
      ...normalizeParams(params)
    });
  }
  // @__NO_SIDE_EFFECTS__
  function _ulid(Class, params) {
    return new Class({
      type: "string",
      format: "ulid",
      check: "string_format",
      abort: false,
      ...normalizeParams(params)
    });
  }
  // @__NO_SIDE_EFFECTS__
  function _xid(Class, params) {
    return new Class({
      type: "string",
      format: "xid",
      check: "string_format",
      abort: false,
      ...normalizeParams(params)
    });
  }
  // @__NO_SIDE_EFFECTS__
  function _ksuid(Class, params) {
    return new Class({
      type: "string",
      format: "ksuid",
      check: "string_format",
      abort: false,
      ...normalizeParams(params)
    });
  }
  // @__NO_SIDE_EFFECTS__
  function _ipv4(Class, params) {
    return new Class({
      type: "string",
      format: "ipv4",
      check: "string_format",
      abort: false,
      ...normalizeParams(params)
    });
  }
  // @__NO_SIDE_EFFECTS__
  function _ipv6(Class, params) {
    return new Class({
      type: "string",
      format: "ipv6",
      check: "string_format",
      abort: false,
      ...normalizeParams(params)
    });
  }
  // @__NO_SIDE_EFFECTS__
  function _cidrv4(Class, params) {
    return new Class({
      type: "string",
      format: "cidrv4",
      check: "string_format",
      abort: false,
      ...normalizeParams(params)
    });
  }
  // @__NO_SIDE_EFFECTS__
  function _cidrv6(Class, params) {
    return new Class({
      type: "string",
      format: "cidrv6",
      check: "string_format",
      abort: false,
      ...normalizeParams(params)
    });
  }
  // @__NO_SIDE_EFFECTS__
  function _base64(Class, params) {
    return new Class({
      type: "string",
      format: "base64",
      check: "string_format",
      abort: false,
      ...normalizeParams(params)
    });
  }
  // @__NO_SIDE_EFFECTS__
  function _base64url(Class, params) {
    return new Class({
      type: "string",
      format: "base64url",
      check: "string_format",
      abort: false,
      ...normalizeParams(params)
    });
  }
  // @__NO_SIDE_EFFECTS__
  function _e164(Class, params) {
    return new Class({
      type: "string",
      format: "e164",
      check: "string_format",
      abort: false,
      ...normalizeParams(params)
    });
  }
  // @__NO_SIDE_EFFECTS__
  function _jwt(Class, params) {
    return new Class({
      type: "string",
      format: "jwt",
      check: "string_format",
      abort: false,
      ...normalizeParams(params)
    });
  }
  // @__NO_SIDE_EFFECTS__
  function _isoDateTime(Class, params) {
    return new Class({
      type: "string",
      format: "datetime",
      check: "string_format",
      offset: false,
      local: false,
      precision: null,
      ...normalizeParams(params)
    });
  }
  // @__NO_SIDE_EFFECTS__
  function _isoDate(Class, params) {
    return new Class({
      type: "string",
      format: "date",
      check: "string_format",
      ...normalizeParams(params)
    });
  }
  // @__NO_SIDE_EFFECTS__
  function _isoTime(Class, params) {
    return new Class({
      type: "string",
      format: "time",
      check: "string_format",
      precision: null,
      ...normalizeParams(params)
    });
  }
  // @__NO_SIDE_EFFECTS__
  function _isoDuration(Class, params) {
    return new Class({
      type: "string",
      format: "duration",
      check: "string_format",
      ...normalizeParams(params)
    });
  }
  // @__NO_SIDE_EFFECTS__
  function _number(Class, params) {
    return new Class(snapshotChecks({ type: "number", checks: [], ...normalizeParams(params) }));
  }
  // @__NO_SIDE_EFFECTS__
  function _int(Class, params) {
    return new Class({
      type: "number",
      check: "number_format",
      abort: false,
      format: "safeint",
      ...normalizeParams(params)
    });
  }
  // @__NO_SIDE_EFFECTS__
  function _boolean(Class, params) {
    return new Class({
      type: "boolean",
      ...normalizeParams(params)
    });
  }
  // @__NO_SIDE_EFFECTS__
  function _unknown(Class) {
    return new Class({
      type: "unknown"
    });
  }
  // @__NO_SIDE_EFFECTS__
  function _never(Class, params) {
    return new Class({
      type: "never",
      ...normalizeParams(params)
    });
  }
  // @__NO_SIDE_EFFECTS__
  function _lt(value, params) {
    return new $ZodCheckLessThan({
      check: "less_than",
      ...normalizeParams(params),
      value,
      inclusive: false
    });
  }
  // @__NO_SIDE_EFFECTS__
  function _lte(value, params) {
    return new $ZodCheckLessThan({
      check: "less_than",
      ...normalizeParams(params),
      value,
      inclusive: true
    });
  }
  // @__NO_SIDE_EFFECTS__
  function _gt(value, params) {
    return new $ZodCheckGreaterThan({
      check: "greater_than",
      ...normalizeParams(params),
      value,
      inclusive: false
    });
  }
  // @__NO_SIDE_EFFECTS__
  function _gte(value, params) {
    return new $ZodCheckGreaterThan({
      check: "greater_than",
      ...normalizeParams(params),
      value,
      inclusive: true
    });
  }
  // @__NO_SIDE_EFFECTS__
  function _multipleOf(value, params) {
    return new $ZodCheckMultipleOf({
      check: "multiple_of",
      ...normalizeParams(params),
      value
    });
  }
  // @__NO_SIDE_EFFECTS__
  function _maxLength(maximum, params) {
    const ch = new $ZodCheckMaxLength({
      check: "max_length",
      ...normalizeParams(params),
      maximum
    });
    return ch;
  }
  // @__NO_SIDE_EFFECTS__
  function _minLength(minimum, params) {
    return new $ZodCheckMinLength({
      check: "min_length",
      ...normalizeParams(params),
      minimum
    });
  }
  // @__NO_SIDE_EFFECTS__
  function _length(length, params) {
    return new $ZodCheckLengthEquals({
      check: "length_equals",
      ...normalizeParams(params),
      length
    });
  }
  // @__NO_SIDE_EFFECTS__
  function _regex(pattern, params) {
    return new $ZodCheckRegex({
      check: "string_format",
      format: "regex",
      ...normalizeParams(params),
      pattern
    });
  }
  // @__NO_SIDE_EFFECTS__
  function _lowercase(params) {
    return new $ZodCheckLowerCase({
      check: "string_format",
      format: "lowercase",
      ...normalizeParams(params)
    });
  }
  // @__NO_SIDE_EFFECTS__
  function _uppercase(params) {
    return new $ZodCheckUpperCase({
      check: "string_format",
      format: "uppercase",
      ...normalizeParams(params)
    });
  }
  // @__NO_SIDE_EFFECTS__
  function _includes(includes, params) {
    return new $ZodCheckIncludes({
      check: "string_format",
      format: "includes",
      ...normalizeParams(params),
      includes
    });
  }
  // @__NO_SIDE_EFFECTS__
  function _startsWith(prefix, params) {
    return new $ZodCheckStartsWith({
      check: "string_format",
      format: "starts_with",
      ...normalizeParams(params),
      prefix
    });
  }
  // @__NO_SIDE_EFFECTS__
  function _endsWith(suffix, params) {
    return new $ZodCheckEndsWith({
      check: "string_format",
      format: "ends_with",
      ...normalizeParams(params),
      suffix
    });
  }
  // @__NO_SIDE_EFFECTS__
  function _properties(shape, params) {
    return new $ZodCheckProperties({
      check: "properties",
      shape,
      ...normalizeParams(params)
    });
  }
  // @__NO_SIDE_EFFECTS__
  function _overwrite(tx) {
    return new $ZodCheckOverwrite({
      check: "overwrite",
      tx
    });
  }
  // @__NO_SIDE_EFFECTS__
  function _normalize(form) {
    return /* @__PURE__ */ _overwrite((input) => input.normalize(form));
  }
  // @__NO_SIDE_EFFECTS__
  function _trim() {
    return /* @__PURE__ */ _overwrite((input) => input.trim());
  }
  // @__NO_SIDE_EFFECTS__
  function _toLowerCase() {
    return /* @__PURE__ */ _overwrite((input) => input.toLowerCase());
  }
  // @__NO_SIDE_EFFECTS__
  function _toUpperCase() {
    return /* @__PURE__ */ _overwrite((input) => input.toUpperCase());
  }
  // @__NO_SIDE_EFFECTS__
  function _slugify() {
    return /* @__PURE__ */ _overwrite((input) => slugify(input));
  }
  // @__NO_SIDE_EFFECTS__
  function _array(Class, element, params) {
    return new Class({
      type: "array",
      element,
      // get element() {
      //   return element;
      // },
      ...normalizeParams(params)
    });
  }
  // @__NO_SIDE_EFFECTS__
  function _refine(Class, fn, _params) {
    const schema = new Class({
      type: "custom",
      check: "custom",
      fn,
      ...normalizeParams(_params)
    });
    return schema;
  }
  // @__NO_SIDE_EFFECTS__
  function _superRefine(fn, params) {
    const ch = /* @__PURE__ */ _check((payload) => {
      payload.addIssue = (issue$1) => {
        if (typeof issue$1 === "string") {
          payload.issues.push(issue(issue$1, payload.value, ch._zod.def));
        } else {
          const _issue = issue$1;
          if (_issue.fatal)
            _issue.continue = false;
          _issue.code ?? (_issue.code = "custom");
          if (!("input" in _issue))
            _issue.input = payload.value;
          _issue.inst ?? (_issue.inst = ch);
          _issue.continue ?? (_issue.continue = !ch._zod.def.abort);
          payload.issues.push(issue(_issue));
        }
      };
      return fn(payload.value, payload);
    }, params);
    return ch;
  }
  // @__NO_SIDE_EFFECTS__
  function _check(fn, params) {
    const ch = new $ZodCheck({
      check: "custom",
      ...normalizeParams(params)
    });
    ch._zod.check = fn;
    return ch;
  }
  function assignProps(target, ...sources) {
    for (const source of sources) {
      for (const key of Reflect.ownKeys(source)) {
        if (Object.prototype.propertyIsEnumerable.call(source, key)) {
          assignProp(target, key, source[key]);
        }
      }
    }
    return target;
  }
  function initializeContext(params) {
    let target = params?.target ?? "draft-2020-12";
    if (target === "draft-4")
      target = "draft-04";
    if (target === "draft-7")
      target = "draft-07";
    return {
      processors: params.processors ?? {},
      metadataRegistry: params?.metadata ?? globalRegistry,
      target,
      unrepresentable: params?.unrepresentable ?? "throw",
      override: params?.override ?? (() => {
      }),
      io: params?.io ?? "output",
      counter: 0,
      seen: /* @__PURE__ */ new Map(),
      sharedDefsExtractedFor: void 0,
      sharedEmitDoneFor: void 0,
      cycles: params?.cycles ?? "ref",
      reused: params?.reused ?? "inline",
      intersections: [],
      deferred: [],
      external: params?.external ?? void 0
    };
  }
  function handleUnrepresentable(schema, ctx, json, params, message) {
    const result = typeof ctx.unrepresentable === "function" ? ctx.unrepresentable({ zodSchema: schema, path: params.path, message }) : ctx.unrepresentable;
    if (result === "any")
      return false;
    if (result === void 0 || result === "throw")
      throw new Error(message);
    Object.assign(json, result);
    return true;
  }
  function processSchema(schema, ctx, _params = { path: [], schemaPath: [] }) {
    var _a2;
    const def = schema._zod.def;
    const seen = ctx.seen.get(schema);
    if (seen) {
      seen.count++;
      const isCycle = _params.schemaPath.includes(schema);
      if (isCycle) {
        seen.cycle = _params.path;
      }
      return seen.schema;
    }
    const result = { schema: {}, count: 1, cycle: void 0, path: _params.path };
    ctx.seen.set(schema, result);
    ctx.sharedDefsExtractedFor = void 0;
    ctx.sharedEmitDoneFor = void 0;
    const overrideSchema = schema._zod.toJSONSchema?.();
    if (overrideSchema) {
      result.schema = overrideSchema;
    } else {
      const params = {
        ..._params,
        schemaPath: [..._params.schemaPath, schema],
        path: _params.path
      };
      if (schema._zod.processJSONSchema) {
        schema._zod.processJSONSchema(ctx, result.schema, params);
      } else {
        const _json = result.schema;
        const processor = ctx.processors[def.type];
        if (!processor) {
          throw new Error(`[toJSONSchema]: Non-representable type encountered: ${def.type}`);
        }
        processor(schema, ctx, _json, params);
      }
      const parent = schema._zod.parent;
      if (parent) {
        if (!result.ref)
          result.ref = parent;
        processSchema(parent, ctx, params);
        ctx.seen.get(parent).isParent = true;
      }
    }
    const meta = ctx.metadataRegistry.get(schema);
    if (meta)
      assignProps(result.schema, meta);
    if (ctx.io === "input" && isTransforming(schema)) {
      delete result.schema.examples;
      delete result.schema.default;
    }
    if (ctx.io === "input" && "_prefault" in result.schema)
      (_a2 = result.schema).default ?? (_a2.default = result.schema._prefault);
    delete result.schema._prefault;
    const _result = ctx.seen.get(schema);
    return _result.schema;
  }
  function encodeJSONPointerSegment(segment) {
    return segment.replace(/~/g, "~0").replace(/\//g, "~1");
  }
  function extractDefs(ctx, schema) {
    const root = ctx.seen.get(schema);
    if (!root)
      throw new Error("Unprocessed schema. This is a bug in Zod.");
    if (ctx.external && ctx.sharedDefsExtractedFor === ctx.external)
      return;
    const idToSchema = /* @__PURE__ */ new Map();
    for (const entry of ctx.seen.entries()) {
      const id = ctx.metadataRegistry.get(entry[0])?.id;
      if (id) {
        const existing = idToSchema.get(id);
        if (existing && existing !== entry[0]) {
          throw new Error(`Duplicate schema id "${id}" detected during JSON Schema conversion. Two different schemas cannot share the same id when converted together.`);
        }
        idToSchema.set(id, entry[0]);
      }
    }
    const makeURI = (entry) => {
      const defsSegment = ctx.target === "draft-2020-12" ? "$defs" : "definitions";
      if (ctx.external) {
        const externalId = ctx.external.registry.get(entry[0])?.id;
        const uriGenerator = ctx.external.uri ?? ((id2) => id2);
        if (externalId) {
          return { ref: uriGenerator(externalId) };
        }
        const id = entry[1].defId ?? entry[1].schema.id ?? `schema${ctx.counter++}`;
        entry[1].defId = id;
        return { defId: id, ref: `${uriGenerator("__shared")}#/${defsSegment}/${encodeJSONPointerSegment(id)}` };
      }
      const uriPrefix = `#`;
      const defUriPrefix = `${uriPrefix}/${defsSegment}/`;
      if (entry[1] === root && !entry[1].schema.id) {
        return { ref: uriPrefix };
      }
      const defId = entry[1].schema.id ?? `__schema${ctx.counter++}`;
      return { defId, ref: defUriPrefix + encodeJSONPointerSegment(defId) };
    };
    const extractToDef = (entry) => {
      if (entry[1].schema.$ref) {
        return;
      }
      const seen = entry[1];
      const { ref, defId } = makeURI(entry);
      seen.def = { ...seen.schema };
      if (defId)
        seen.defId = defId;
      const schema2 = seen.schema;
      for (const key in schema2) {
        delete schema2[key];
      }
      schema2.$ref = ref;
    };
    if (ctx.cycles === "throw") {
      for (const entry of ctx.seen.entries()) {
        const seen = entry[1];
        if (seen.cycle) {
          throw new Error(`Cycle detected: #/${seen.cycle?.join("/")}/<root>

Set the \`cycles\` parameter to \`"ref"\` to resolve cyclical schemas with defs.`);
        }
      }
    }
    for (const entry of ctx.seen.entries()) {
      const seen = entry[1];
      if (schema === entry[0]) {
        extractToDef(entry);
        continue;
      }
      if (ctx.external) {
        const ext = ctx.external.registry.get(entry[0])?.id;
        if (schema !== entry[0] && ext) {
          extractToDef(entry);
          continue;
        }
      }
      const id = ctx.metadataRegistry.get(entry[0])?.id;
      if (id) {
        extractToDef(entry);
        continue;
      }
      if (seen.cycle) {
        extractToDef(entry);
        continue;
      }
      if (seen.count > 1) {
        if (ctx.reused === "ref") {
          extractToDef(entry);
        }
      }
    }
    if (ctx.external)
      ctx.sharedDefsExtractedFor = ctx.external;
  }
  function compactTypeUnion(schema) {
    const options = schema.anyOf;
    if (!Array.isArray(options) || options.length === 0 || schema.type !== void 0)
      return;
    const types = [];
    for (const option of options) {
      if (!option || typeof option !== "object")
        return;
      compactTypeUnion(option);
      const keys = Object.keys(option);
      if (keys.length !== 1 || keys[0] !== "type")
        return;
      const type = option.type;
      for (const member of Array.isArray(type) ? type : [type]) {
        if (typeof member !== "string")
          return;
        if (!types.includes(member))
          types.push(member);
      }
    }
    delete schema.anyOf;
    schema.type = types.length === 1 ? types[0] : types;
  }
  const FOLDABLE_KEYS = /* @__PURE__ */ new Set(["type", "properties", "required", "additionalProperties"]);
  const UNION_KEYS = ["oneOf", "anyOf"];
  function undeclaredConstraint(member) {
    const extra = member.additionalProperties;
    if (extra === void 0 || extra === false || typeof extra !== "object" || extra === null)
      return null;
    return Object.keys(extra).length ? extra : null;
  }
  function foldObjects(members2) {
    const objects = [];
    for (const member of members2) {
      if (typeof member !== "object" || member.type !== "object")
        return null;
      for (const key in member) {
        if (!FOLDABLE_KEYS.has(key))
          return null;
      }
      objects.push(member);
    }
    const properties = {};
    const required2 = /* @__PURE__ */ new Set();
    for (const object2 of objects) {
      for (const key in object2.properties) {
        if (Object.prototype.hasOwnProperty.call(properties, key))
          continue;
        const parts = [];
        for (const other of objects) {
          const part = other.properties?.[key] ?? undeclaredConstraint(other);
          if (part === null || part === void 0)
            continue;
          if (!parts.some((seen) => JSON.stringify(seen) === JSON.stringify(part)))
            parts.push(part);
        }
        const merged = parts.length === 1 ? parts[0] : foldObjects(parts) ?? { allOf: parts };
        assignProp(properties, key, merged);
      }
      for (const key of object2.required ?? [])
        required2.add(key);
    }
    const folded = { type: "object", properties };
    if (required2.size)
      folded.required = [...required2];
    if (objects.every((object2) => object2.additionalProperties === false)) {
      folded.additionalProperties = false;
    } else {
      const constraints = [];
      for (const object2 of objects) {
        const constraint = undeclaredConstraint(object2);
        if (constraint && !constraints.some((seen) => JSON.stringify(seen) === JSON.stringify(constraint)))
          constraints.push(constraint);
      }
      if (constraints.length === 1)
        folded.additionalProperties = constraints[0];
      else if (constraints.length > 1)
        folded.additionalProperties = { allOf: constraints };
    }
    return folded;
  }
  function foldIntersection(json) {
    const allOf = json.allOf;
    if (!Array.isArray(allOf) || allOf.length < 2)
      return;
    for (const key of FOLDABLE_KEYS)
      if (key in json)
        return;
    const unions = allOf.filter((m) => UNION_KEYS.some((k) => Array.isArray(m[k])));
    let folded = null;
    if (!unions.length) {
      folded = foldObjects(allOf);
    } else {
      const union2 = unions[0];
      const keyword = UNION_KEYS.find((k) => Array.isArray(union2[k]));
      if (Object.keys(union2).length !== 1)
        return;
      const rest = allOf.filter((m) => m !== union2);
      const branches = union2[keyword].map((branch) => foldObjects([...rest, branch]));
      if (branches.some((b) => !b))
        return;
      folded = { [keyword]: branches };
    }
    if (!folded)
      return;
    delete json.allOf;
    assignProps(json, folded);
  }
  function finalize(ctx, schema) {
    const root = ctx.seen.get(schema);
    if (!root)
      throw new Error("Unprocessed schema. This is a bug in Zod.");
    const flattenRef = (zodSchema) => {
      const seen = ctx.seen.get(zodSchema);
      if (seen.ref === null)
        return;
      const schema2 = seen.def ?? seen.schema;
      const _cached = { ...schema2 };
      const ref = seen.ref;
      seen.ref = null;
      if (ref) {
        flattenRef(ref);
        const refSeen = ctx.seen.get(ref);
        const refSchema = refSeen.schema;
        if (refSchema.$ref && (ctx.target === "draft-07" || ctx.target === "draft-04" || ctx.target === "openapi-3.0")) {
          schema2.allOf = schema2.allOf ?? [];
          schema2.allOf.push(refSchema);
        } else {
          assignProps(schema2, refSchema);
        }
        assignProps(schema2, _cached);
        const isParentRef = zodSchema._zod.parent === ref;
        if (isParentRef) {
          for (const key in schema2) {
            if (key === "$ref" || key === "allOf")
              continue;
            if (!(key in _cached)) {
              delete schema2[key];
            }
          }
        }
        if (refSchema.$ref && refSeen.def) {
          for (const key in schema2) {
            if (key === "$ref" || key === "allOf")
              continue;
            if (key in refSeen.def && JSON.stringify(schema2[key]) === JSON.stringify(refSeen.def[key])) {
              delete schema2[key];
            }
          }
        }
      }
      const parent = zodSchema._zod.parent;
      if (parent && parent !== ref) {
        flattenRef(parent);
        const parentSeen = ctx.seen.get(parent);
        if (parentSeen?.schema.$ref) {
          schema2.$ref = parentSeen.schema.$ref;
          if (parentSeen.def) {
            for (const key in schema2) {
              if (key === "$ref" || key === "allOf")
                continue;
              if (key in parentSeen.def && JSON.stringify(schema2[key]) === JSON.stringify(parentSeen.def[key])) {
                delete schema2[key];
              }
            }
          }
        }
      }
      ctx.override({
        zodSchema,
        jsonSchema: schema2,
        path: seen.path ?? []
      });
    };
    if (!ctx.external || ctx.sharedEmitDoneFor !== ctx.external) {
      for (const entry of [...ctx.seen.entries()].reverse()) {
        flattenRef(entry[0]);
      }
      if (ctx.target !== "openapi-3.0") {
        for (const entry of ctx.seen.entries()) {
          compactTypeUnion(entry[1].def ?? entry[1].schema);
        }
      }
      for (const rewrite of ctx.deferred)
        rewrite();
      if (ctx.intersections.length) {
        const carriers = /* @__PURE__ */ new Map();
        for (const seen of ctx.seen.values()) {
          for (const json of [seen.schema, seen.def]) {
            const allOf = json?.allOf;
            if (!Array.isArray(allOf))
              continue;
            const existing = carriers.get(allOf);
            if (existing)
              existing.push(json);
            else
              carriers.set(allOf, [json]);
          }
        }
        for (const allOf of ctx.intersections) {
          for (const json of carriers.get(allOf) ?? [])
            foldIntersection(json);
        }
      }
    }
    const result = {};
    if (ctx.target === "draft-2020-12") {
      result.$schema = "https://json-schema.org/draft/2020-12/schema";
    } else if (ctx.target === "draft-07") {
      result.$schema = "http://json-schema.org/draft-07/schema#";
    } else if (ctx.target === "draft-04") {
      result.$schema = "http://json-schema.org/draft-04/schema#";
    } else if (ctx.target === "openapi-3.0") ;
    else ;
    if (ctx.external?.uri) {
      const id = ctx.external.registry.get(schema)?.id;
      if (!id)
        throw new Error("Schema is missing an `id` property");
      result.$id = ctx.external.uri(id);
    }
    assignProps(result, root.defId ? root.schema : root.def ?? root.schema);
    const rootMetaId = ctx.metadataRegistry.get(schema)?.id;
    if (rootMetaId !== void 0 && result.id === rootMetaId)
      delete result.id;
    const defs = ctx.external?.defs ?? {};
    if (!ctx.external || ctx.sharedEmitDoneFor !== ctx.external) {
      for (const entry of ctx.seen.entries()) {
        const seen = entry[1];
        if (seen.def && seen.defId) {
          if (seen.def.id === seen.defId)
            delete seen.def.id;
          assignProp(defs, seen.defId, seen.def);
        }
      }
    }
    if (ctx.external)
      ctx.sharedEmitDoneFor = ctx.external;
    if (ctx.external) ;
    else {
      if (Object.keys(defs).length > 0) {
        if (ctx.target === "draft-2020-12") {
          result.$defs = defs;
        } else {
          result.definitions = defs;
        }
      }
    }
    try {
      const finalized = JSON.parse(JSON.stringify(result));
      Object.defineProperty(finalized, "~standard", {
        value: {
          ...schema["~standard"],
          jsonSchema: {
            input: createStandardJSONSchemaMethod(schema, "input", ctx.processors),
            output: createStandardJSONSchemaMethod(schema, "output", ctx.processors)
          }
        },
        enumerable: false,
        writable: false
      });
      return finalized;
    } catch (_err) {
      throw new Error("Error converting schema to JSON.");
    }
  }
  function isTransforming(_schema, _ctx) {
    const ctx = _ctx ?? { seen: /* @__PURE__ */ new Set() };
    if (ctx.seen.has(_schema))
      return false;
    ctx.seen.add(_schema);
    const def = _schema._zod.def;
    if (def.type === "transform")
      return true;
    if (def.type === "array")
      return isTransforming(def.element, ctx);
    if (def.type === "set")
      return isTransforming(def.valueType, ctx);
    if (def.type === "lazy")
      return isTransforming(def.getter(), ctx);
    if (def.type === "promise" || def.type === "optional" || def.type === "nonoptional" || def.type === "nullable" || def.type === "readonly" || def.type === "default" || def.type === "prefault" || def.type === "catch") {
      return isTransforming(def.innerType, ctx);
    }
    if (def.type === "intersection") {
      return isTransforming(def.left, ctx) || isTransforming(def.right, ctx);
    }
    if (def.type === "record" || def.type === "map") {
      return isTransforming(def.keyType, ctx) || isTransforming(def.valueType, ctx);
    }
    if (def.type === "pipe") {
      if (_schema._zod.traits.has("$ZodCodec"))
        return true;
      return isTransforming(def.in, ctx) || isTransforming(def.out, ctx);
    }
    if (def.type === "object") {
      for (const key in def.shape) {
        if (isTransforming(def.shape[key], ctx))
          return true;
      }
      return false;
    }
    if (def.type === "union") {
      for (const option of def.options) {
        if (isTransforming(option, ctx))
          return true;
      }
      return false;
    }
    if (def.type === "tuple") {
      for (const item of def.items) {
        if (isTransforming(item, ctx))
          return true;
      }
      if (def.rest && isTransforming(def.rest, ctx))
        return true;
      return false;
    }
    return false;
  }
  const createToJSONSchemaMethod = (schema, processors = {}) => (params) => {
    const ctx = initializeContext({ ...params, processors });
    processSchema(schema, ctx);
    extractDefs(ctx, schema);
    return finalize(ctx, schema);
  };
  const createStandardJSONSchemaMethod = (schema, io, processors = {}) => (params) => {
    const { libraryOptions, target } = params ?? {};
    const ctx = initializeContext({ ...libraryOptions ?? {}, target, io, processors });
    processSchema(schema, ctx);
    extractDefs(ctx, schema);
    return finalize(ctx, schema);
  };
  const narrowMin = (agg, key, value) => {
    if (agg[key] === void 0 || value > agg[key])
      agg[key] = value;
  };
  const narrowMax = (agg, key, value) => {
    if (agg[key] === void 0 || value < agg[key])
      agg[key] = value;
  };
  const narrowBoth = (agg, value) => {
    narrowMin(agg, "minimum", value);
    narrowMax(agg, "maximum", value);
  };
  const addDivisor = (agg, value) => {
    agg.multipleOf ?? (agg.multipleOf = []);
    if (!agg.multipleOf.includes(value))
      agg.multipleOf.push(value);
  };
  const addPattern = (agg, pattern) => {
    agg.patterns ?? (agg.patterns = /* @__PURE__ */ new Set());
    agg.patterns.add(pattern);
  };
  const intersectMime = (agg, mime) => {
    agg.mime = agg.mime ? agg.mime.filter((m) => mime.includes(m)) : [...mime];
  };
  const setFormat = (agg, format) => {
    agg.format = format;
    if (format.includes("int"))
      agg.isInt = true;
  };
  const minContributor = (agg, def) => narrowMin(agg, "minimum", def.minimum);
  const maxContributor = (agg, def) => narrowMax(agg, "maximum", def.maximum);
  const formatContributor = (ranges) => (agg, def) => {
    setFormat(agg, def.format);
    const [minimum, maximum] = ranges[def.format];
    narrowMin(agg, "minimum", minimum);
    narrowMax(agg, "maximum", maximum);
  };
  const contributors = {
    greater_than: (agg, def) => narrowMin(agg, def.inclusive ? "minimum" : "exclusiveMinimum", def.value),
    less_than: (agg, def) => narrowMax(agg, def.inclusive ? "maximum" : "exclusiveMaximum", def.value),
    multiple_of: (agg, def) => addDivisor(agg, def.value),
    number_format: formatContributor(NUMBER_FORMAT_RANGES),
    bigint_format: formatContributor(BIGINT_FORMAT_RANGES),
    min_length: minContributor,
    max_length: maxContributor,
    length_equals: (agg, def) => narrowBoth(agg, def.length),
    min_size: minContributor,
    max_size: maxContributor,
    size_equals: (agg, def) => narrowBoth(agg, def.size),
    string_format: (agg, def) => {
      setFormat(agg, def.format);
      if (def.pattern)
        addPattern(agg, def.pattern);
      if (def.format === "base64" || def.format === "base64url")
        agg.contentEncoding = def.format;
      if (def.local || def.precision === -1)
        agg.laxFormat = true;
    },
    mime_type: (agg, def) => intersectMime(agg, def.mime)
  };
  function aggregateChecks(schema) {
    const agg = {};
    const def = schema._zod.def;
    const list = schema._zod.traits.has("$ZodCheck") ? [schema, ...def.checks ?? []] : def.checks ?? [];
    for (const ch of list)
      contributors[ch._zod.def.check]?.(agg, ch._zod.def);
    const bag = schema._zod.bag;
    if (bag.minimum !== void 0)
      narrowMin(agg, "minimum", bag.minimum);
    if (bag.exclusiveMinimum !== void 0)
      narrowMin(agg, "exclusiveMinimum", bag.exclusiveMinimum);
    if (bag.maximum !== void 0)
      narrowMax(agg, "maximum", bag.maximum);
    if (bag.exclusiveMaximum !== void 0)
      narrowMax(agg, "exclusiveMaximum", bag.exclusiveMaximum);
    if (bag.multipleOf !== void 0)
      addDivisor(agg, bag.multipleOf);
    if (bag.format !== void 0) {
      agg.format ?? (agg.format = bag.format);
      if (bag.format.includes("int"))
        agg.isInt = true;
    }
    if (bag.mime)
      intersectMime(agg, bag.mime);
    for (const pattern of bag.patterns ?? [])
      addPattern(agg, pattern);
    return agg;
  }
  const formatMap = {
    guid: "uuid",
    url: "uri",
    datetime: "date-time",
    json_string: "json-string",
    regex: ""
    // do not set
  };
  const exactPatterns = /* @__PURE__ */ new Map([
    [base64Charset, base64],
    [base64urlCharset, base64url]
  ]);
  const exactPattern = (p) => exactPatterns.get(p) ?? p;
  const stringProcessor = (schema, ctx, _json, _params) => {
    const json = _json;
    json.type = "string";
    const { minimum, maximum, format, patterns, contentEncoding, laxFormat } = aggregateChecks(schema);
    if (typeof minimum === "number")
      json.minLength = minimum;
    if (typeof maximum === "number")
      json.maxLength = maximum;
    if (format) {
      json.format = formatMap[format] ?? format;
      if (json.format === "")
        delete json.format;
      if (format === "time" || laxFormat) {
        delete json.format;
      }
    }
    if (contentEncoding)
      json.contentEncoding = contentEncoding;
    if (patterns && patterns.size > 0) {
      const patternList = [...patterns].map(exactPattern);
      if (patternList.length === 1)
        json.pattern = patternList[0].source;
      else if (patternList.length > 1) {
        json.allOf = [
          ...patternList.map((regex) => ({
            ...ctx.target === "draft-07" || ctx.target === "draft-04" || ctx.target === "openapi-3.0" ? { type: "string" } : {},
            pattern: regex.source
          }))
        ];
      }
    }
  };
  const numberProcessor = (schema, ctx, _json, params) => {
    const json = _json;
    const { minimum, maximum, multipleOf, exclusiveMaximum, exclusiveMinimum, isInt } = aggregateChecks(schema);
    json.type = isInt ? "integer" : "number";
    const exMin = typeof exclusiveMinimum === "number" && exclusiveMinimum >= (minimum ?? Number.NEGATIVE_INFINITY);
    const exMax = typeof exclusiveMaximum === "number" && exclusiveMaximum <= (maximum ?? Number.POSITIVE_INFINITY);
    const legacy = ctx.target === "draft-04" || ctx.target === "openapi-3.0";
    if (exMin) {
      if (legacy) {
        json.minimum = exclusiveMinimum;
        json.exclusiveMinimum = true;
      } else {
        json.exclusiveMinimum = exclusiveMinimum;
      }
    } else if (typeof minimum === "number") {
      json.minimum = minimum;
    }
    if (exMax) {
      if (legacy) {
        json.maximum = exclusiveMaximum;
        json.exclusiveMaximum = true;
      } else {
        json.exclusiveMaximum = exclusiveMaximum;
      }
    } else if (typeof maximum === "number") {
      json.maximum = maximum;
    }
    if (multipleOf) {
      const divisors = /* @__PURE__ */ new Set();
      for (const divisor of multipleOf) {
        if (Number.isFinite(divisor) && divisor !== 0)
          divisors.add(Math.abs(divisor));
        else
          handleUnrepresentable(schema, ctx, json, params, `A multipleOf divisor of ${divisor} cannot be represented in JSON Schema`);
      }
      const [first, ...rest] = divisors;
      if (first !== void 0)
        json.multipleOf = first;
      if (rest.length)
        json.allOf = [...json.allOf ?? [], ...rest.map((m) => ({ multipleOf: m }))];
    }
  };
  const booleanProcessor = (_schema, _ctx, json, _params) => {
    json.type = "boolean";
  };
  const neverProcessor = (_schema, _ctx, json, _params) => {
    json.not = {};
  };
  const unknownProcessor = (_schema, _ctx, _json, _params) => {
  };
  const enumProcessor = (schema, _ctx, json, _params) => {
    const def = schema._zod.def;
    const values = getEnumValues(def.entries);
    if (values.length === 0) {
      json.not = {};
      return;
    }
    if (values.every((v) => typeof v === "number"))
      json.type = "number";
    if (values.every((v) => typeof v === "string"))
      json.type = "string";
    json.enum = values;
  };
  const literalProcessor = (schema, ctx, json, params) => {
    const def = schema._zod.def;
    if (def.values.length === 0) {
      json.not = {};
      return;
    }
    const vals = [];
    for (const val of def.values) {
      if (val === void 0) {
        if (handleUnrepresentable(schema, ctx, json, params, "Literal `undefined` cannot be represented in JSON Schema"))
          return;
      } else if (typeof val === "bigint") {
        if (handleUnrepresentable(schema, ctx, json, params, "BigInt literals cannot be represented in JSON Schema"))
          return;
        vals.push(Number(val));
      } else {
        vals.push(val);
      }
    }
    if (vals.length === 0) ;
    else if (vals.length === 1) {
      const val = vals[0];
      json.type = val === null ? "null" : typeof val;
      if (ctx.target === "draft-04" || ctx.target === "openapi-3.0") {
        json.enum = [val];
      } else {
        json.const = val;
      }
    } else {
      if (vals.every((v) => typeof v === "number"))
        json.type = "number";
      if (vals.every((v) => typeof v === "string"))
        json.type = "string";
      if (vals.every((v) => typeof v === "boolean"))
        json.type = "boolean";
      if (vals.every((v) => v === null))
        json.type = "null";
      json.enum = vals;
    }
  };
  const customProcessor = (schema, ctx, json, params) => {
    handleUnrepresentable(schema, ctx, json, params, "Custom types cannot be represented in JSON Schema");
  };
  const transformProcessor = (schema, ctx, json, params) => {
    handleUnrepresentable(schema, ctx, json, params, "Transforms cannot be represented in JSON Schema");
  };
  const arrayProcessor = (schema, ctx, _json, params) => {
    const json = _json;
    const def = schema._zod.def;
    const { minimum, maximum } = aggregateChecks(schema);
    if (typeof minimum === "number")
      json.minItems = minimum;
    if (typeof maximum === "number")
      json.maxItems = maximum;
    json.type = "array";
    json.items = processSchema(def.element, ctx, {
      ...params,
      path: [...params.path, "items"]
    });
  };
  function inputOptin(schema) {
    const def = schema._zod.def;
    if (def.type === "pipe" && def.in._zod.traits.has("$ZodTransform")) {
      return inputOptin(def.out);
    }
    if (def.type === "catch") {
      return inputOptin(def.innerType);
    }
    return schema._zod.optin;
  }
  const objectProcessor = (schema, ctx, _json, params) => {
    const json = _json;
    const def = schema._zod.def;
    const shape = def.shape;
    const symbolKeys = Object.getOwnPropertySymbols(shape);
    if (symbolKeys.length && handleUnrepresentable(schema, ctx, json, params, "Symbol keys cannot be represented in JSON Schema")) {
      return;
    }
    json.type = "object";
    json.properties = {};
    for (const key in shape) {
      assignProp(json.properties, key, processSchema(shape[key], ctx, {
        ...params,
        path: [...params.path, "properties", key]
      }));
    }
    const requiredKeys = [];
    for (const key of Object.keys(shape)) {
      const field = def.shape[key];
      if (ctx.io === "input" ? inputOptin(field) === void 0 : field._zod.optout === void 0) {
        requiredKeys.push(key);
      }
    }
    if (requiredKeys.length > 0) {
      json.required = requiredKeys;
    }
    if (def.catchall?._zod.def.type === "never") {
      json.additionalProperties = false;
    } else if (!def.catchall) {
      if (ctx.io === "output")
        json.additionalProperties = false;
    } else if (def.catchall) {
      json.additionalProperties = processSchema(def.catchall, ctx, {
        ...params,
        path: [...params.path, "additionalProperties"]
      });
    }
  };
  const unionProcessor = (schema, ctx, json, params) => {
    const def = schema._zod.def;
    const isExclusive = def.inclusive === false;
    const options = def.options.map((x, i) => processSchema(x, ctx, {
      ...params,
      path: [...params.path, isExclusive ? "oneOf" : "anyOf", i]
    }));
    if (isExclusive) {
      json.oneOf = options;
    } else {
      json.anyOf = options;
    }
  };
  const intersectionProcessor = (schema, ctx, json, params) => {
    const def = schema._zod.def;
    const a = processSchema(def.left, ctx, {
      ...params,
      path: [...params.path, "allOf", 0]
    });
    const b = processSchema(def.right, ctx, {
      ...params,
      path: [...params.path, "allOf", 1]
    });
    const isSimpleIntersection = (val) => "allOf" in val && Object.keys(val).length === 1;
    const allOf = [
      ...isSimpleIntersection(a) ? a.allOf : [a],
      ...isSimpleIntersection(b) ? b.allOf : [b]
    ];
    json.allOf = allOf;
    ctx.intersections.push(allOf);
  };
  const tupleProcessor = (schema, ctx, _json, params) => {
    const json = _json;
    const def = schema._zod.def;
    json.type = "array";
    const prefixPath = ctx.target === "draft-2020-12" ? "prefixItems" : "items";
    const restPath = ctx.target === "draft-2020-12" ? "items" : ctx.target === "openapi-3.0" ? "items" : "additionalItems";
    const prefixItems = def.items.map((x, i) => processSchema(x, ctx, {
      ...params,
      path: [...params.path, prefixPath, i]
    }));
    const rest = def.rest ? processSchema(def.rest, ctx, {
      ...params,
      path: [...params.path, restPath, ...ctx.target === "openapi-3.0" ? [def.items.length] : []]
    }) : null;
    let minItems = def.items.length;
    while (minItems > 0) {
      const item = def.items[minItems - 1];
      const optional2 = ctx.io === "input" ? inputOptin(item) !== void 0 : item._zod.optout === "optional";
      if (!optional2)
        break;
      minItems--;
    }
    const maxItems = def.items.length;
    const isClosed = !def.rest;
    if (ctx.target === "draft-2020-12") {
      json.prefixItems = prefixItems;
      if (isClosed) {
        json.items = false;
      } else if (rest) {
        json.items = rest;
      }
      if (minItems > 0)
        json.minItems = minItems;
      if (isClosed)
        json.maxItems = maxItems;
    } else if (ctx.target === "openapi-3.0") {
      json.items = {
        anyOf: prefixItems
      };
      if (rest) {
        json.items.anyOf.push(rest);
      }
      if (minItems > 0)
        json.minItems = minItems;
      if (isClosed)
        json.maxItems = maxItems;
    } else {
      json.items = prefixItems;
      if (isClosed) {
        json.additionalItems = false;
      } else if (rest) {
        json.additionalItems = rest;
      }
      if (minItems > 0)
        json.minItems = minItems;
      if (isClosed)
        json.maxItems = maxItems;
    }
    const { minimum, maximum } = aggregateChecks(schema);
    if (typeof minimum === "number")
      json.minItems = minimum;
    if (typeof maximum === "number")
      json.maxItems = maximum;
  };
  function stringifyKeyNames(bySchema, json, visited) {
    if (json.$ref) {
      if (visited.has(json))
        return json;
      visited.add(json);
      const def = bySchema.get(json)?.def;
      if (!def)
        return json;
      const inlined = stringifyKeyNames(bySchema, def, visited);
      return inlined === def ? json : inlined;
    }
    for (const keyword of ["anyOf", "oneOf"]) {
      const branches = json[keyword];
      if (!Array.isArray(branches))
        continue;
      const mapped = branches.map((branch) => stringifyKeyNames(bySchema, branch, visited));
      if (mapped.some((branch, i) => branch !== branches[i]))
        json = { ...json, [keyword]: mapped };
    }
    const types = Array.isArray(json.type) ? json.type : [json.type];
    const numericType = !types.includes("string") && types.some((t) => t === "number" || t === "integer");
    const values = json.enum ?? (json.const !== void 0 ? [json.const] : void 0);
    if (!numericType && !values?.some((v) => typeof v === "number"))
      return json;
    const { minimum, maximum, exclusiveMinimum, exclusiveMaximum, multipleOf, format, id, ...rest } = json;
    if (rest.enum)
      rest.enum = rest.enum.map((v) => typeof v === "number" ? String(v) : v);
    else if (typeof rest.const === "number")
      rest.const = String(rest.const);
    if (!numericType)
      return rest;
    rest.type = "string";
    if (!values)
      rest.pattern = (types.includes("number") ? number$1 : integer).source;
    return rest;
  }
  const pendingRecords = /* @__PURE__ */ new WeakMap();
  function rewriteKeyNames(ctx) {
    const bySchema = /* @__PURE__ */ new Map();
    for (const entry of ctx.seen.values()) {
      if (entry.def && !bySchema.has(entry.schema))
        bySchema.set(entry.schema, entry);
    }
    const rewrites = /* @__PURE__ */ new Map();
    for (const record2 of pendingRecords.get(ctx) ?? []) {
      const seen = ctx.seen.get(record2);
      const names = (seen?.def ?? seen?.schema)?.propertyNames;
      if (!names || names === true || rewrites.has(names))
        continue;
      const rewritten = stringifyKeyNames(bySchema, names, /* @__PURE__ */ new Set());
      if (rewritten !== names)
        rewrites.set(names, rewritten);
    }
    if (!rewrites.size)
      return;
    for (const entry of ctx.seen.values()) {
      for (const carrier of [entry.schema, entry.def]) {
        const rewritten = carrier && rewrites.get(carrier.propertyNames);
        if (rewritten)
          carrier.propertyNames = rewritten;
      }
    }
  }
  const recordProcessor = (schema, ctx, _json, params) => {
    const json = _json;
    const def = schema._zod.def;
    json.type = "object";
    const keyType = def.keyType;
    const patterns = aggregateChecks(keyType).patterns;
    if (def.mode === "loose" && patterns && patterns.size > 0) {
      const valueSchema = processSchema(def.valueType, ctx, {
        ...params,
        path: [...params.path, "patternProperties", "*"]
      });
      json.patternProperties = {};
      for (const pattern of patterns) {
        assignProp(json.patternProperties, exactPattern(pattern).source, valueSchema);
      }
    } else {
      if (ctx.target === "draft-07" || ctx.target === "draft-2020-12") {
        json.propertyNames = processSchema(def.keyType, ctx, {
          ...params,
          path: [...params.path, "propertyNames"]
        });
        let pending = pendingRecords.get(ctx);
        if (!pending) {
          pending = [];
          pendingRecords.set(ctx, pending);
          ctx.deferred.push(() => rewriteKeyNames(ctx));
        }
        pending.push(schema);
      }
      json.additionalProperties = processSchema(def.valueType, ctx, {
        ...params,
        path: [...params.path, "additionalProperties"]
      });
    }
    const keyValues = keyType._zod.values;
    const omittableOnInput = ctx.io === "input" && inputOptin(def.valueType) !== void 0;
    if (keyValues && !def.partial && !omittableOnInput) {
      const validKeyValues = [...keyValues].filter((v) => typeof v === "string" || typeof v === "number");
      if (validKeyValues.length > 0) {
        json.required = validKeyValues.map(String);
      }
    }
  };
  const nullableProcessor = (schema, ctx, json, params) => {
    const def = schema._zod.def;
    const inner = processSchema(def.innerType, ctx, params);
    const seen = ctx.seen.get(schema);
    if (ctx.target === "openapi-3.0") {
      seen.ref = def.innerType;
      json.nullable = true;
    } else {
      json.anyOf = [inner, { type: "null" }];
    }
  };
  const nonoptionalProcessor = (schema, ctx, _json, params) => {
    const def = schema._zod.def;
    processSchema(def.innerType, ctx, params);
    const seen = ctx.seen.get(schema);
    seen.ref = def.innerType;
  };
  const UNREPRESENTABLE_DEFAULT = /* @__PURE__ */ Symbol();
  function serializeDefaultValue(value, schema, ctx, json, params) {
    let unrepresentable = false;
    const serialized = JSON.stringify(value, (_, val) => {
      if (typeof val !== "bigint")
        return val;
      unrepresentable = true;
      return null;
    });
    if (!unrepresentable)
      return JSON.parse(serialized);
    handleUnrepresentable(schema, ctx, json, params, "BigInt defaults cannot be represented in JSON Schema");
    return UNREPRESENTABLE_DEFAULT;
  }
  const defaultProcessor = (schema, ctx, json, params) => {
    const def = schema._zod.def;
    processSchema(def.innerType, ctx, params);
    const seen = ctx.seen.get(schema);
    seen.ref = def.innerType;
    const value = serializeDefaultValue(def.defaultValue, schema, ctx, json, params);
    if (value !== UNREPRESENTABLE_DEFAULT)
      json.default = value;
  };
  const prefaultProcessor = (schema, ctx, json, params) => {
    const def = schema._zod.def;
    processSchema(def.innerType, ctx, params);
    const seen = ctx.seen.get(schema);
    seen.ref = def.innerType;
    if (ctx.io !== "input")
      return;
    const value = serializeDefaultValue(def.defaultValue, schema, ctx, json, params);
    if (value !== UNREPRESENTABLE_DEFAULT)
      json._prefault = value;
  };
  const catchProcessor = (schema, ctx, json, params) => {
    const def = schema._zod.def;
    processSchema(def.innerType, ctx, params);
    const seen = ctx.seen.get(schema);
    seen.ref = def.innerType;
    let catchValue;
    try {
      catchValue = def.catchValue(void 0);
    } catch {
      handleUnrepresentable(schema, ctx, json, params, "Dynamic catch values are not supported in JSON Schema");
      return;
    }
    json.default = catchValue;
  };
  const pipeProcessor = (schema, ctx, _json, params) => {
    const def = schema._zod.def;
    const inIsTransform = def.in._zod.traits.has("$ZodTransform");
    const innerType = ctx.io === "input" ? inIsTransform ? def.out : def.in : def.out;
    processSchema(innerType, ctx, params);
    const seen = ctx.seen.get(schema);
    seen.ref = innerType;
  };
  const readonlyProcessor = (schema, ctx, json, params) => {
    const def = schema._zod.def;
    processSchema(def.innerType, ctx, params);
    const seen = ctx.seen.get(schema);
    seen.ref = def.innerType;
    json.readOnly = true;
  };
  const optionalProcessor = (schema, ctx, _json, params) => {
    const def = schema._zod.def;
    processSchema(def.innerType, ctx, params);
    const seen = ctx.seen.get(schema);
    seen.ref = def.innerType;
  };
  const _installedErrorProtos = /* @__PURE__ */ new WeakSet([Object.prototype, Error.prototype]);
  function _lazyMethod(proto, key, make) {
    Object.defineProperty(proto, key, {
      configurable: true,
      enumerable: false,
      get() {
        const value = make(this);
        Object.defineProperty(this, key, { value, configurable: true, writable: true });
        return value;
      },
      set(value) {
        Object.defineProperty(this, key, { value, configurable: true, writable: true });
      }
    });
  }
  const initializer = (inst, issues) => {
    $ZodError.init(inst, issues);
    inst.name = "ZodError";
    const proto = Object.getPrototypeOf(inst);
    if (_installedErrorProtos.has(proto))
      return;
    _installedErrorProtos.add(proto);
    _lazyMethod(proto, "format", (self) => (mapper) => formatError(self, mapper));
    _lazyMethod(proto, "flatten", (self) => (mapper) => flattenError(self, mapper));
    _lazyMethod(proto, "addIssue", (self) => (issue2) => {
      self.issues.push(issue2);
      self.message = JSON.stringify(self.issues, jsonStringifyReplacer, 2);
    });
    _lazyMethod(proto, "addIssues", (self) => (issues2) => {
      self.issues.push(...issues2);
      self.message = JSON.stringify(self.issues, jsonStringifyReplacer, 2);
    });
    Object.defineProperty(proto, "isEmpty", {
      configurable: true,
      enumerable: false,
      get() {
        return this.issues.length === 0;
      }
    });
  };
  const ZodRealError = /* @__PURE__ */ $constructor("ZodError", initializer, void 0, {
    Parent: Error
  });
  const parse = /* @__PURE__ */ _parse(ZodRealError);
  const parseAsync = /* @__PURE__ */ _parseAsync(ZodRealError);
  const safeParse = /* @__PURE__ */ _safeParse(ZodRealError);
  const safeParseAsync = /* @__PURE__ */ _safeParseAsync(ZodRealError);
  const encode = /* @__PURE__ */ _encode(ZodRealError);
  const decode = /* @__PURE__ */ _decode(ZodRealError);
  const encodeAsync = /* @__PURE__ */ _encodeAsync(ZodRealError);
  const decodeAsync = /* @__PURE__ */ _decodeAsync(ZodRealError);
  const safeEncode = /* @__PURE__ */ _safeEncode(ZodRealError);
  const safeDecode = /* @__PURE__ */ _safeDecode(ZodRealError);
  const safeEncodeAsync = /* @__PURE__ */ _safeEncodeAsync(ZodRealError);
  const safeDecodeAsync = /* @__PURE__ */ _safeDecodeAsync(ZodRealError);
  function _ensureDefaultLocale() {
    if (!globalConfig.localeError)
      config(en());
  }
  function _ensureDefaultMemoizer() {
    if (!globalConfig.memoizer)
      config({ memoizer: memoizer() });
  }
  const ZodType = /* @__PURE__ */ $constructor("ZodType", (inst, def) => {
    _ensureDefaultLocale();
    $ZodType.init(inst, def);
    inst.def = def;
    inst.type = def.type;
    return inst;
  }, {
    check(...chks) {
      const def = this.def;
      return this.clone(mergeDefs(def, {
        checks: [
          ...def.checks ?? [],
          ...chks.map((ch) => typeof ch === "function" ? { _zod: { check: ch, def: { check: "custom" }, onattach: [] } } : ch)
        ]
      }), { parent: true });
    },
    with(...chks) {
      return this.check(...chks);
    },
    clone(def, params) {
      return clone(this, def, params);
    },
    brand() {
      return this;
    },
    register(reg, meta) {
      reg.add(this, meta);
      return this;
    },
    refine(check, params) {
      return this.check(refine(check, params));
    },
    superRefine(refinement, params) {
      return this.check(superRefine(refinement, params));
    },
    overwrite(fn) {
      return this.check(/* @__PURE__ */ _overwrite(fn));
    },
    optional() {
      return optional(this);
    },
    exactOptional() {
      return exactOptional(this);
    },
    nullable() {
      return nullable(this);
    },
    nullish() {
      return optional(nullable(this));
    },
    nonoptional(params) {
      return nonoptional(this, params);
    },
    array() {
      return array(this);
    },
    or(arg) {
      return union([this, arg]);
    },
    and(arg) {
      return intersection(this, arg);
    },
    transform(tx) {
      return pipe(this, transform(tx));
    },
    default(d) {
      return _default(this, d);
    },
    prefault(d) {
      return prefault(this, d);
    },
    catch(params) {
      return _catch(this, params);
    },
    pipe(target) {
      return pipe(this, target);
    },
    readonly() {
      return readonly(this);
    },
    describe(description) {
      const cl = this.clone();
      globalRegistry.add(cl, { description });
      return cl;
    },
    meta(...args) {
      if (args.length === 0)
        return globalRegistry.get(this);
      const cl = this.clone();
      globalRegistry.add(cl, args[0]);
      return cl;
    },
    isOptional() {
      return this.safeParse(void 0).success;
    },
    isNullable() {
      return this.safeParse(null).success;
    },
    apply(fn, ...args) {
      return args.length === 0 ? fn(this) : fn(this, ...args);
    },
    // Overrides core's `~standard` to add `jsonSchema`. Must stay a prototype entry: redefining it per instance demotes instances to dictionary mode.
    get "~standard"() {
      return hide(this, "~standard", {
        ...standardProps(this),
        jsonSchema: {
          input: createStandardJSONSchemaMethod(this, "input"),
          output: createStandardJSONSchemaMethod(this, "output")
        }
      });
    },
    set "~standard"(value) {
      own(this, "~standard", value);
    },
    parse: function _parse2(data, params) {
      return parse(this, data, params, { callee: _parse2 });
    },
    parseAsync: async function _parseAsync2(data, params) {
      return await parseAsync(this, data, params, { callee: _parseAsync2 });
    },
    safeParse(data, params) {
      return safeParse(this, data, params);
    },
    async safeParseAsync(data, params) {
      return safeParseAsync(this, data, params);
    },
    // `spa` is an alias: same function object as `safeParseAsync`, as before.
    get spa() {
      return this?.safeParseAsync;
    },
    set spa(value) {
      own(this, "spa", value);
    },
    validate(data, params) {
      return validate(this, data, params);
    },
    validateAsync(data, params) {
      return validateAsync$1(this, data, params);
    },
    encode: function _encode2(data, params) {
      return encode(this, data, params, { callee: _encode2 });
    },
    decode: function _decode2(data, params) {
      return decode(this, data, params, { callee: _decode2 });
    },
    encodeAsync: async function _encodeAsync2(data, params) {
      return await encodeAsync(this, data, params, { callee: _encodeAsync2 });
    },
    decodeAsync: async function _decodeAsync2(data, params) {
      return await decodeAsync(this, data, params, { callee: _decodeAsync2 });
    },
    safeEncode(data, params) {
      return safeEncode(this, data, params);
    },
    safeDecode(data, params) {
      return safeDecode(this, data, params);
    },
    async safeEncodeAsync(data, params) {
      return safeEncodeAsync(this, data, params);
    },
    async safeDecodeAsync(data, params) {
      return safeDecodeAsync(this, data, params);
    },
    toJSONSchema(params) {
      return createToJSONSchemaMethod(this, {})(params);
    },
    // Reads through to the registry on every access, so it must not cache.
    get description() {
      return globalRegistry.get(this)?.description;
    },
    // No setter: `schema._def = x` throws, as it did when `_def` was a non-writable own property.
    get _def() {
      return this._zod.def;
    }
  });
  const _ZodString = /* @__PURE__ */ $constructor(
    "_ZodString",
    (inst, def) => {
      $ZodString.init(inst, def);
      ZodType.init(inst, def);
      inst._zod.processJSONSchema = (ctx, json, params) => stringProcessor(inst, ctx, json);
    },
    /* @__PURE__ */ derived({
      format: (inst) => aggregateChecks(inst).format ?? null,
      minLength: (inst) => aggregateChecks(inst).minimum ?? null,
      maxLength: (inst) => aggregateChecks(inst).maximum ?? null
    }, {
      regex(...args) {
        return this.check(/* @__PURE__ */ _regex(...args));
      },
      includes(...args) {
        return this.check(/* @__PURE__ */ _includes(...args));
      },
      startsWith(...args) {
        return this.check(/* @__PURE__ */ _startsWith(...args));
      },
      endsWith(...args) {
        return this.check(/* @__PURE__ */ _endsWith(...args));
      },
      min(...args) {
        return this.check(/* @__PURE__ */ _minLength(...args));
      },
      max(...args) {
        return this.check(/* @__PURE__ */ _maxLength(...args));
      },
      length(...args) {
        return this.check(/* @__PURE__ */ _length(...args));
      },
      nonempty(...args) {
        return this.check(/* @__PURE__ */ _minLength(1, ...args));
      },
      lowercase(params) {
        return this.check(/* @__PURE__ */ _lowercase(params));
      },
      uppercase(params) {
        return this.check(/* @__PURE__ */ _uppercase(params));
      },
      trim() {
        return this.check(/* @__PURE__ */ _trim());
      },
      normalize(...args) {
        return this.check(/* @__PURE__ */ _normalize(...args));
      },
      toLowerCase() {
        return this.check(/* @__PURE__ */ _toLowerCase());
      },
      toUpperCase() {
        return this.check(/* @__PURE__ */ _toUpperCase());
      },
      slugify() {
        return this.check(/* @__PURE__ */ _slugify());
      }
    })
  );
  const ZodString = /* @__PURE__ */ $constructor("ZodString", (inst, def) => {
    $ZodString.init(inst, def);
    _ZodString.init(inst, def);
  }, {
    email(params) {
      return this.check(/* @__PURE__ */ _email(ZodEmail, params));
    },
    url(params) {
      return this.check(/* @__PURE__ */ _url(ZodURL, params));
    },
    jwt(params) {
      return this.check(/* @__PURE__ */ _jwt(ZodJWT, params));
    },
    emoji(params) {
      return this.check(/* @__PURE__ */ _emoji(ZodEmoji, params));
    },
    guid(params) {
      return this.check(/* @__PURE__ */ _guid(ZodGUID, params));
    },
    uuid(params) {
      return this.check(/* @__PURE__ */ _uuid(ZodUUID, params));
    },
    uuidv4(params) {
      return this.check(/* @__PURE__ */ _uuidv4(ZodUUID, params));
    },
    uuidv6(params) {
      return this.check(/* @__PURE__ */ _uuidv6(ZodUUID, params));
    },
    uuidv7(params) {
      return this.check(/* @__PURE__ */ _uuidv7(ZodUUID, params));
    },
    nanoid(params) {
      return this.check(/* @__PURE__ */ _nanoid(ZodNanoID, params));
    },
    cuid(params) {
      return this.check(/* @__PURE__ */ _cuid(ZodCUID, params));
    },
    cuid2(params) {
      return this.check(/* @__PURE__ */ _cuid2(ZodCUID2, params));
    },
    ulid(params) {
      return this.check(/* @__PURE__ */ _ulid(ZodULID, params));
    },
    base64(params) {
      return this.check(/* @__PURE__ */ _base64(ZodBase64, params));
    },
    base64url(params) {
      return this.check(/* @__PURE__ */ _base64url(ZodBase64URL, params));
    },
    xid(params) {
      return this.check(/* @__PURE__ */ _xid(ZodXID, params));
    },
    ksuid(params) {
      return this.check(/* @__PURE__ */ _ksuid(ZodKSUID, params));
    },
    ipv4(params) {
      return this.check(/* @__PURE__ */ _ipv4(ZodIPv4, params));
    },
    ipv6(params) {
      return this.check(/* @__PURE__ */ _ipv6(ZodIPv6, params));
    },
    cidrv4(params) {
      return this.check(/* @__PURE__ */ _cidrv4(ZodCIDRv4, params));
    },
    cidrv6(params) {
      return this.check(/* @__PURE__ */ _cidrv6(ZodCIDRv6, params));
    },
    e164(params) {
      return this.check(/* @__PURE__ */ _e164(ZodE164, params));
    },
    datetime(params) {
      return this.check(/* @__PURE__ */ _isoDateTime(ZodISODateTime, params));
    },
    date(params) {
      return this.check(/* @__PURE__ */ _isoDate(ZodISODate, params));
    },
    time(params) {
      return this.check(/* @__PURE__ */ _isoTime(ZodISOTime, params));
    },
    duration(params) {
      return this.check(/* @__PURE__ */ _isoDuration(ZodISODuration, params));
    }
  });
  function string(params) {
    return /* @__PURE__ */ _string(ZodString, params);
  }
  const ZodStringFormat = /* @__PURE__ */ $constructor("ZodStringFormat", (inst, def) => {
    $ZodStringFormat.init(inst, def);
    _ZodString.init(inst, def);
  });
  const ZodISODateTime = /* @__PURE__ */ $constructor("ZodISODateTime", (inst, def) => {
    $ZodISODateTime.init(inst, def);
    ZodStringFormat.init(inst, def);
  });
  const ZodISODate = /* @__PURE__ */ $constructor("ZodISODate", (inst, def) => {
    $ZodISODate.init(inst, def);
    ZodStringFormat.init(inst, def);
  });
  const ZodISOTime = /* @__PURE__ */ $constructor("ZodISOTime", (inst, def) => {
    $ZodISOTime.init(inst, def);
    ZodStringFormat.init(inst, def);
  });
  const ZodISODuration = /* @__PURE__ */ $constructor("ZodISODuration", (inst, def) => {
    $ZodISODuration.init(inst, def);
    ZodStringFormat.init(inst, def);
  });
  const ZodEmail = /* @__PURE__ */ $constructor("ZodEmail", (inst, def) => {
    $ZodEmail.init(inst, def);
    ZodStringFormat.init(inst, def);
  });
  const ZodGUID = /* @__PURE__ */ $constructor("ZodGUID", (inst, def) => {
    $ZodGUID.init(inst, def);
    ZodStringFormat.init(inst, def);
  });
  const ZodUUID = /* @__PURE__ */ $constructor("ZodUUID", (inst, def) => {
    $ZodUUID.init(inst, def);
    ZodStringFormat.init(inst, def);
  });
  const ZodURL = /* @__PURE__ */ $constructor("ZodURL", (inst, def) => {
    $ZodURL.init(inst, def);
    ZodStringFormat.init(inst, def);
  });
  const ZodEmoji = /* @__PURE__ */ $constructor("ZodEmoji", (inst, def) => {
    $ZodEmoji.init(inst, def);
    ZodStringFormat.init(inst, def);
  });
  const ZodNanoID = /* @__PURE__ */ $constructor("ZodNanoID", (inst, def) => {
    $ZodNanoID.init(inst, def);
    ZodStringFormat.init(inst, def);
  });
  const ZodCUID = /* @__PURE__ */ $constructor("ZodCUID", (inst, def) => {
    $ZodCUID.init(inst, def);
    ZodStringFormat.init(inst, def);
  });
  const ZodCUID2 = /* @__PURE__ */ $constructor("ZodCUID2", (inst, def) => {
    $ZodCUID2.init(inst, def);
    ZodStringFormat.init(inst, def);
  });
  const ZodULID = /* @__PURE__ */ $constructor("ZodULID", (inst, def) => {
    $ZodULID.init(inst, def);
    ZodStringFormat.init(inst, def);
  });
  const ZodXID = /* @__PURE__ */ $constructor("ZodXID", (inst, def) => {
    $ZodXID.init(inst, def);
    ZodStringFormat.init(inst, def);
  });
  const ZodKSUID = /* @__PURE__ */ $constructor("ZodKSUID", (inst, def) => {
    $ZodKSUID.init(inst, def);
    ZodStringFormat.init(inst, def);
  });
  const ZodIPv4 = /* @__PURE__ */ $constructor("ZodIPv4", (inst, def) => {
    $ZodIPv4.init(inst, def);
    ZodStringFormat.init(inst, def);
  });
  const ZodIPv6 = /* @__PURE__ */ $constructor("ZodIPv6", (inst, def) => {
    $ZodIPv6.init(inst, def);
    ZodStringFormat.init(inst, def);
  });
  const ZodCIDRv4 = /* @__PURE__ */ $constructor("ZodCIDRv4", (inst, def) => {
    $ZodCIDRv4.init(inst, def);
    ZodStringFormat.init(inst, def);
  });
  const ZodCIDRv6 = /* @__PURE__ */ $constructor("ZodCIDRv6", (inst, def) => {
    $ZodCIDRv6.init(inst, def);
    ZodStringFormat.init(inst, def);
  });
  const ZodBase64 = /* @__PURE__ */ $constructor("ZodBase64", (inst, def) => {
    $ZodBase64.init(inst, def);
    ZodStringFormat.init(inst, def);
  });
  const ZodBase64URL = /* @__PURE__ */ $constructor("ZodBase64URL", (inst, def) => {
    $ZodBase64URL.init(inst, def);
    ZodStringFormat.init(inst, def);
  });
  const ZodE164 = /* @__PURE__ */ $constructor("ZodE164", (inst, def) => {
    $ZodE164.init(inst, def);
    ZodStringFormat.init(inst, def);
  });
  const ZodJWT = /* @__PURE__ */ $constructor("ZodJWT", (inst, def) => {
    $ZodJWT.init(inst, def);
    ZodStringFormat.init(inst, def);
  });
  const ZodNumber = /* @__PURE__ */ $constructor(
    "ZodNumber",
    (inst, def) => {
      $ZodNumber.init(inst, def);
      ZodType.init(inst, def);
      inst._zod.processJSONSchema = (ctx, json, params) => numberProcessor(inst, ctx, json, params);
      inst.isFinite = true;
    },
    /* @__PURE__ */ derived({
      minValue: (inst) => {
        const { minimum, exclusiveMinimum } = aggregateChecks(inst);
        return Math.max(minimum ?? Number.NEGATIVE_INFINITY, exclusiveMinimum ?? Number.NEGATIVE_INFINITY);
      },
      maxValue: (inst) => {
        const { maximum, exclusiveMaximum } = aggregateChecks(inst);
        return Math.min(maximum ?? Number.POSITIVE_INFINITY, exclusiveMaximum ?? Number.POSITIVE_INFINITY);
      },
      isInt: (inst) => {
        const { isInt, multipleOf } = aggregateChecks(inst);
        return !!isInt || !!multipleOf?.some(Number.isSafeInteger);
      },
      format: (inst) => aggregateChecks(inst).format ?? null
    }, {
      gt(value, params) {
        return this.check(/* @__PURE__ */ _gt(value, params));
      },
      gte(value, params) {
        return this.check(/* @__PURE__ */ _gte(value, params));
      },
      min(value, params) {
        return this.check(/* @__PURE__ */ _gte(value, params));
      },
      lt(value, params) {
        return this.check(/* @__PURE__ */ _lt(value, params));
      },
      lte(value, params) {
        return this.check(/* @__PURE__ */ _lte(value, params));
      },
      max(value, params) {
        return this.check(/* @__PURE__ */ _lte(value, params));
      },
      int(params) {
        return this.check(int(params));
      },
      safe(params) {
        return this.check(int(params));
      },
      positive(params) {
        return this.check(/* @__PURE__ */ _gt(0, params));
      },
      nonnegative(params) {
        return this.check(/* @__PURE__ */ _gte(0, params));
      },
      negative(params) {
        return this.check(/* @__PURE__ */ _lt(0, params));
      },
      nonpositive(params) {
        return this.check(/* @__PURE__ */ _lte(0, params));
      },
      multipleOf(value, params) {
        return this.check(/* @__PURE__ */ _multipleOf(value, params));
      },
      step(value, params) {
        return this.check(/* @__PURE__ */ _multipleOf(value, params));
      },
      finite() {
        return this;
      }
    })
  );
  function number(params) {
    return /* @__PURE__ */ _number(ZodNumber, params);
  }
  const ZodNumberFormat = /* @__PURE__ */ $constructor("ZodNumberFormat", (inst, def) => {
    $ZodNumberFormat.init(inst, def);
    ZodNumber.init(inst, def);
  });
  function int(params) {
    return /* @__PURE__ */ _int(ZodNumberFormat, params);
  }
  const ZodBoolean = /* @__PURE__ */ $constructor("ZodBoolean", (inst, def) => {
    $ZodBoolean.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => booleanProcessor(inst, ctx, json);
  });
  function boolean(params) {
    return /* @__PURE__ */ _boolean(ZodBoolean, params);
  }
  const ZodUnknown = /* @__PURE__ */ $constructor("ZodUnknown", (inst, def) => {
    $ZodUnknown.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => unknownProcessor();
  });
  function unknown() {
    return /* @__PURE__ */ _unknown(ZodUnknown);
  }
  const ZodNever = /* @__PURE__ */ $constructor("ZodNever", (inst, def) => {
    $ZodNever.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => neverProcessor(inst, ctx, json);
  });
  function never(params) {
    return /* @__PURE__ */ _never(ZodNever, params);
  }
  const ZodArray = /* @__PURE__ */ $constructor("ZodArray", (inst, def) => {
    _ensureDefaultMemoizer();
    $ZodArray.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => arrayProcessor(inst, ctx, json, params);
    inst.element = def.element;
  }, {
    min(n, params) {
      return this.check(/* @__PURE__ */ _minLength(n, params));
    },
    nonempty(params) {
      return this.check(/* @__PURE__ */ _minLength(1, params));
    },
    max(n, params) {
      return this.check(/* @__PURE__ */ _maxLength(n, params));
    },
    length(n, params) {
      return this.check(/* @__PURE__ */ _length(n, params));
    },
    unwrap() {
      return this.element;
    }
  });
  function array(element, params) {
    return /* @__PURE__ */ _array(ZodArray, element, params);
  }
  const ZodObject = /* @__PURE__ */ $constructor("ZodObject", (inst, def) => {
    _ensureDefaultMemoizer();
    $ZodObjectJIT.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => objectProcessor(inst, ctx, json, params);
    installLazyProp(inst, "shape", (self) => self._zod.def.shape, false);
  }, {
    keyof() {
      return _enum(Object.keys(this._zod.def.shape));
    },
    catchall(catchall) {
      return this.clone(mergeDefs(this._zod.def, { catchall }));
    },
    passthrough() {
      return this.clone(mergeDefs(this._zod.def, { catchall: unknown() }));
    },
    loose() {
      return this.clone(mergeDefs(this._zod.def, { catchall: unknown() }));
    },
    strict() {
      return this.clone(mergeDefs(this._zod.def, { catchall: never() }));
    },
    strip() {
      return this.clone(mergeDefs(this._zod.def, { catchall: void 0 }));
    },
    extend(incoming) {
      return extend(this, incoming);
    },
    safeExtend(incoming) {
      return safeExtend(this, incoming);
    },
    merge(other) {
      return merge(this, other);
    },
    pick(mask) {
      return pick(this, mask);
    },
    omit(mask) {
      return omit(this, mask);
    },
    partial(...args) {
      return partial(ZodOptional, this, args[0]);
    },
    exactPartial(...args) {
      return partial(ZodExactOptional, this, args[0], "exactPartial");
    },
    required(...args) {
      return required(ZodNonOptional, this, args[0]);
    }
  });
  function object(shape, params) {
    const def = {
      type: "object",
      shape: shape ?? {},
      ...normalizeParams(params)
    };
    return new ZodObject(def);
  }
  function strictObject(shape, params) {
    return new ZodObject({
      type: "object",
      shape,
      catchall: never(),
      ...normalizeParams(params)
    });
  }
  const ZodUnion = /* @__PURE__ */ $constructor("ZodUnion", (inst, def) => {
    $ZodUnion.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => unionProcessor(inst, ctx, json, params);
    inst.options = def.options;
  });
  function union(options, params) {
    return new ZodUnion({
      type: "union",
      options,
      ...normalizeParams(params)
    });
  }
  const ZodDiscriminatedUnion = /* @__PURE__ */ $constructor("ZodDiscriminatedUnion", (inst, def) => {
    ZodUnion.init(inst, def);
    $ZodDiscriminatedUnion.init(inst, def);
  });
  function discriminatedUnion(discriminator, options, params) {
    return new ZodDiscriminatedUnion({
      type: "union",
      options,
      discriminator,
      ...normalizeParams(params)
    });
  }
  const ZodIntersection = /* @__PURE__ */ $constructor("ZodIntersection", (inst, def) => {
    $ZodIntersection.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => intersectionProcessor(inst, ctx, json, params);
  });
  function intersection(left, right) {
    return new ZodIntersection({
      type: "intersection",
      left,
      right
    });
  }
  const ZodTuple = /* @__PURE__ */ $constructor("ZodTuple", (inst, def) => {
    _ensureDefaultMemoizer();
    $ZodTuple.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => tupleProcessor(inst, ctx, json, params);
  }, {
    rest(rest) {
      return this.clone({
        ...this._zod.def,
        rest
      });
    },
    partial() {
      const def = this._zod.def;
      if (def.checks?.length)
        throw new Error(".partial() cannot be used on tuple schemas containing refinements");
      return this.clone({
        ...def,
        items: def.items.map((item) => new ZodOptional({ type: "optional", innerType: item }))
      });
    }
  });
  function tuple(items, _paramsOrRest, _params) {
    const hasRest = _paramsOrRest instanceof $ZodType;
    const params = hasRest ? _params : _paramsOrRest;
    const rest = hasRest ? _paramsOrRest : null;
    return new ZodTuple({
      type: "tuple",
      items,
      rest,
      ...normalizeParams(params)
    });
  }
  const ZodRecord = /* @__PURE__ */ $constructor("ZodRecord", (inst, def) => {
    _ensureDefaultMemoizer();
    $ZodRecord.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => recordProcessor(inst, ctx, json, params);
    inst.keyType = def.keyType;
    inst.valueType = def.valueType;
  });
  function record(keyType, valueType, params) {
    if (!valueType || !valueType._zod) {
      return new ZodRecord({
        type: "record",
        keyType: string(),
        valueType: keyType,
        ...normalizeParams(valueType)
      });
    }
    return new ZodRecord({
      type: "record",
      keyType,
      valueType,
      ...normalizeParams(params)
    });
  }
  function partialRecord(keyType, valueType, params) {
    return new ZodRecord({
      type: "record",
      keyType,
      valueType,
      ...normalizeParams(params),
      partial: true
    });
  }
  const ZodEnum = /* @__PURE__ */ $constructor("ZodEnum", (inst, def) => {
    $ZodEnum.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => enumProcessor(inst, ctx, json);
    inst.enum = def.entries;
    inst.options = [...inst._zod.values];
    const keys = new Set(Object.keys(def.entries));
    inst.extract = (values, params) => {
      const newEntries = {};
      for (const value of values) {
        if (keys.has(value)) {
          newEntries[value] = def.entries[value];
        } else
          throw new Error(`Key ${value} not found in enum`);
      }
      return new ZodEnum({
        ...def,
        checks: [],
        ...normalizeParams(params),
        entries: newEntries
      });
    };
    inst.exclude = (values, params) => {
      const newEntries = { ...def.entries };
      for (const value of values) {
        if (keys.has(value)) {
          delete newEntries[value];
        } else
          throw new Error(`Key ${value} not found in enum`);
      }
      return new ZodEnum({
        ...def,
        checks: [],
        ...normalizeParams(params),
        entries: newEntries
      });
    };
  });
  function _enum(values, params) {
    const entries = Array.isArray(values) ? Object.fromEntries(values.map((v) => [v, v])) : values;
    return new ZodEnum({
      type: "enum",
      entries,
      ...normalizeParams(params)
    });
  }
  const ZodLiteral = /* @__PURE__ */ $constructor("ZodLiteral", (inst, def) => {
    $ZodLiteral.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => literalProcessor(inst, ctx, json, params);
    inst.values = new Set(def.values);
    Object.defineProperty(inst, "value", {
      get() {
        if (def.values.length > 1) {
          throw new Error("This schema contains multiple valid literal values. Use `.values` instead.");
        }
        return def.values[0];
      }
    });
  });
  function literal(value, params) {
    return new ZodLiteral({
      type: "literal",
      values: Array.isArray(value) ? value : [value],
      ...normalizeParams(params)
    });
  }
  const ZodTransform = /* @__PURE__ */ $constructor("ZodTransform", (inst, def) => {
    _ensureDefaultMemoizer();
    $ZodTransform.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => transformProcessor(inst, ctx, json, params);
    inst._zod.parse = (payload, _ctx) => {
      if (_ctx.direction === "backward") {
        throw new $ZodEncodeError(inst.constructor.name);
      }
      payload.addIssue = (issue$1) => {
        if (typeof issue$1 === "string") {
          payload.issues.push(issue(issue$1, payload.value, def));
        } else {
          const _issue = issue$1;
          if (_issue.fatal)
            _issue.continue = false;
          _issue.code ?? (_issue.code = "custom");
          if (!("input" in _issue))
            _issue.input = payload.value;
          _issue.inst ?? (_issue.inst = inst);
          payload.issues.push(issue(_issue));
        }
      };
      const output = def.transform(payload.value, payload);
      if (output instanceof Promise) {
        return output.then((output2) => {
          payload.value = output2;
          return payload;
        });
      }
      payload.value = output;
      return payload;
    };
  });
  function transform(fn) {
    return new ZodTransform({
      type: "transform",
      transform: fn
    });
  }
  const ZodOptional = /* @__PURE__ */ $constructor("ZodOptional", (inst, def) => {
    $ZodOptional.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => optionalProcessor(inst, ctx, json, params);
    inst.unwrap = () => inst._zod.def.innerType;
  });
  function optional(innerType) {
    return new ZodOptional({
      type: "optional",
      innerType
    });
  }
  const ZodExactOptional = /* @__PURE__ */ $constructor("ZodExactOptional", (inst, def) => {
    $ZodExactOptional.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => optionalProcessor(inst, ctx, json, params);
    inst.unwrap = () => inst._zod.def.innerType;
  });
  function exactOptional(innerType) {
    return new ZodExactOptional({
      type: "optional",
      innerType
    });
  }
  const ZodNullable = /* @__PURE__ */ $constructor("ZodNullable", (inst, def) => {
    $ZodNullable.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => nullableProcessor(inst, ctx, json, params);
    inst.unwrap = () => inst._zod.def.innerType;
  });
  function nullable(innerType) {
    return new ZodNullable({
      type: "nullable",
      innerType
    });
  }
  const ZodDefault = /* @__PURE__ */ $constructor("ZodDefault", (inst, def) => {
    $ZodDefault.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => defaultProcessor(inst, ctx, json, params);
    inst.unwrap = () => inst._zod.def.innerType;
    inst.removeDefault = inst.unwrap;
  });
  function _default(innerType, defaultValue) {
    return new ZodDefault({
      type: "default",
      innerType,
      get defaultValue() {
        return typeof defaultValue === "function" ? defaultValue() : shallowClone(defaultValue);
      }
    });
  }
  const ZodPrefault = /* @__PURE__ */ $constructor("ZodPrefault", (inst, def) => {
    $ZodPrefault.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => prefaultProcessor(inst, ctx, json, params);
    inst.unwrap = () => inst._zod.def.innerType;
  });
  function prefault(innerType, defaultValue) {
    return new ZodPrefault({
      type: "prefault",
      innerType,
      get defaultValue() {
        return typeof defaultValue === "function" ? defaultValue() : shallowClone(defaultValue);
      }
    });
  }
  const ZodNonOptional = /* @__PURE__ */ $constructor("ZodNonOptional", (inst, def) => {
    $ZodNonOptional.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => nonoptionalProcessor(inst, ctx, json, params);
    inst.unwrap = () => inst._zod.def.innerType;
  });
  function nonoptional(innerType, params) {
    return new ZodNonOptional({
      type: "nonoptional",
      innerType,
      ...normalizeParams(params)
    });
  }
  const ZodCatch = /* @__PURE__ */ $constructor("ZodCatch", (inst, def) => {
    $ZodCatch.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => catchProcessor(inst, ctx, json, params);
    inst.unwrap = () => inst._zod.def.innerType;
    inst.removeCatch = inst.unwrap;
  });
  function _catch(innerType, catchValue) {
    return new ZodCatch({
      type: "catch",
      innerType,
      catchValue: typeof catchValue === "function" ? catchValue : constantCatch(catchValue)
    });
  }
  const ZodPipe = /* @__PURE__ */ $constructor("ZodPipe", (inst, def) => {
    $ZodPipe.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => pipeProcessor(inst, ctx, json, params);
    inst.in = def.in;
    inst.out = def.out;
  });
  function pipe(in_, out) {
    return new ZodPipe({
      type: "pipe",
      in: in_,
      out
      // ...util.normalizeParams(params),
    });
  }
  const ZodReadonly = /* @__PURE__ */ $constructor("ZodReadonly", (inst, def) => {
    $ZodReadonly.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => readonlyProcessor(inst, ctx, json, params);
    inst.unwrap = () => inst._zod.def.innerType;
  });
  function readonly(innerType) {
    return new ZodReadonly({
      type: "readonly",
      innerType
    });
  }
  const ZodCustom = /* @__PURE__ */ $constructor("ZodCustom", (inst, def) => {
    $ZodCustom.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => customProcessor(inst, ctx, json, params);
  });
  function refine(fn, _params = {}) {
    return /* @__PURE__ */ _refine(ZodCustom, fn, _params);
  }
  function superRefine(fn, params) {
    return /* @__PURE__ */ _superRefine(fn, params);
  }
  const ZodInstanceOf = /* @__PURE__ */ $constructor("ZodInstanceOf", (inst, def) => {
    ZodCustom.init(inst, def);
  }, {
    properties(shape, params) {
      return this.check(/* @__PURE__ */ _properties(shape, params));
    }
  });
  function _instanceof(cls, params = {}) {
    const inst = new ZodInstanceOf({
      type: "custom",
      check: "custom",
      fn: (data) => data instanceof cls,
      abort: true,
      ...normalizeParams(params)
    });
    inst._zod.bag.Class = cls;
    inst._zod.check = (payload) => {
      if (!(payload.value instanceof cls)) {
        payload.issues.push({
          code: "invalid_type",
          expected: cls.name,
          input: payload.value,
          inst,
          path: [...inst._zod.def.path ?? []]
        });
      }
    };
    return inst;
  }
  function formatNumber(value, options) {
    return value.toLocaleString(languageLocale(), options);
  }
  function formatDate(at, options) {
    return new Date(at).toLocaleDateString(regionalLocale(), options);
  }
  function formatTime(at, options) {
    return new Date(at).toLocaleTimeString(regionalLocale(), options);
  }
  function formatDateTime(at, options) {
    return new Date(at).toLocaleString(regionalLocale(), options);
  }
  function formatLanguageDate(at, options) {
    return new Date(at).toLocaleDateString(languageLocale(), options);
  }
  const SERVED_LOCALE = "en-US";
  const pluralRules = /* @__PURE__ */ new Map();
  function pluralCategory(count, locale = languageFormatTag(currentLanguage())) {
    let rules = pluralRules.get(locale);
    if (!rules) {
      rules = new Intl.PluralRules(locale);
      pluralRules.set(locale, rules);
    }
    return rules.select(count);
  }
  const hourSchema = number().int().min(0).max(23);
  const minuteSchema = number().int().min(0).max(59);
  const timeZoneSchema = string().min(1).max(64);
  const automationEventFilterSchema = record(string(), string());
  const automationSpecSchema = discriminatedUnion("kind", [
    strictObject({ kind: literal("every"), minutes: number().int().min(1) }),
    strictObject({
      kind: literal("daily"),
      hour: hourSchema,
      minute: minuteSchema,
      /** Absent on a rule made before time zones: it follows this computer's clock. */
      timeZone: timeZoneSchema.optional()
    }),
    strictObject({
      kind: literal("weekly"),
      /** The weekdays it runs on, 0 for Sunday through 6 for Saturday. */
      days: array(number().int().min(0).max(6)).min(1).max(7),
      hour: hourSchema,
      minute: minuteSchema,
      timeZone: timeZoneSchema
    }),
    strictObject({ kind: literal("once"), at: number().int() }),
    /**
     * When something happens (docs/automation.md, "Events"): each time one of
     * the events an integration declares arrives. The app looks at that
     * integration's declared cadence on its one tick.
     */
    strictObject({
      kind: literal("event"),
      /** The integration's id (src/shared/integrations.ts). */
      integration: string().min(1).max(48),
      /** One of the events its kind declares, by name. */
      event: string().min(1).max(48),
      /** Only fields the integration event declares; omitted means its defaults. */
      filter: automationEventFilterSchema.optional(),
      /**
       * What the rule waits for, in words (docs/automation.md, "The event
       * screen"): with the event screen on, an event the decision model reads
       * as plainly not this skips the first mate. Absent, nothing is screened.
       */
      waitsFor: string().min(1).optional()
    })
  ]);
  const automationStateSchema = _enum(["draft", "enabled", "paused", "completed"]);
  strictObject({
    version: number().int(),
    text: string(),
    at: number(),
    revision: number().int(),
    by: _enum(["crewmate", "captain"]),
    task: strictObject({ id: string(), key: string(), title: string() }).optional()
  });
  const automationRuleSchema = strictObject({
    id: string(),
    /** Absent when nobody named it. */
    name: string().optional(),
    state: automationStateSchema,
    spec: automationSpecSchema,
    prompt: string(),
    /** The project its prompt is about, when it has one. */
    projectId: string().optional(),
    revision: number().int(),
    /** The next run; null unless the rule is enabled. */
    nextFire: number().nullable(),
    /** When it last ran, or null if it never has. */
    lastFired: number().nullable(),
    /** Whether a captain request or edit stands behind the rule (its saved authority). */
    captainRequested: boolean(),
    /**
     * What an event rule listens for, in its integration's own words ("An
     * item arrives in Stand-in"); absent on a schedule, or while its
     * integration is not connected.
     */
    when: string().optional(),
    /**
     * Why an event rule waits though its integration's id is connected: that
     * id stands for another connection now, or the rule was saved before the
     * app could tell (docs/automation.md, "Events"). Saving it with
     * `reconnect` picks what is connected now.
     */
    stopped: string().optional(),
    /**
     * A turned-on event rule whose every look failed for an hour
     * (docs/automation.md, "When every look fails"): when the first failed look
     * was, and what the newest answered, in the integration's own words. It
     * keeps looking, and this goes once a look answers.
     */
    failing: strictObject({ since: number(), reason: string() }).optional(),
    /**
     * The runbook wake that brought the rule (docs/automation.md, "The
     * heartbeat"): it comes and goes with that runbook's switch, and nobody
     * edits or deletes it; Pause and Resume still work.
     */
    brought: literal("heartbeat").optional()
  });
  discriminatedUnion("state", [
    strictObject({ state: literal("ready"), rules: array(automationRuleSchema) }),
    strictObject({
      state: literal("unavailable"),
      reason: string(),
      /** The rules as they were last read, since this app started; empty before any read. */
      rules: array(automationRuleSchema)
    })
  ]);
  const AUTOMATION_UNREADABLE = "Your automations cannot be read right now.";
  const automationDeliverySchema = _enum([
    "waiting",
    "retrying",
    "handled",
    "cancelled",
    "sent"
  ]);
  const automationCancelReasonSchema = _enum(["edited", "paused", "cleared"]);
  strictObject({
    id: number().int(),
    revision: number().int(),
    plannedAt: number(),
    firedAt: number(),
    catchUp: boolean(),
    /** Further occurrences folded into this run, by downtime or while it waited. */
    missed: number().int(),
    /** How many events an event rule's run carries; absent on a scheduled run. */
    events: number().int().optional(),
    /**
     * How many of those events the event screen kept from the first mate, as
     * plainly not what the rule waits for; the run is then `cancelled` with
     * no reason (docs/automation.md, "The event screen").
     */
    screened: number().int().optional(),
    prompt: string(),
    delivery: automationDeliverySchema,
    /** When it was handled or cancelled; null while it waits, or for a run recorded before. */
    settledAt: number().nullable(),
    cancelReason: automationCancelReasonSchema.optional(),
    /** The tasks the turn that handled it touched, as they are now. */
    tasks: array(strictObject({ id: string(), key: string(), title: string() })),
    /** The cards that turn showed; `open` while the card is still up. */
    cards: array(strictObject({ id: string(), title: string(), open: boolean() })),
    /**
     * What the run found: the closing words of the first mate's turn that
     * handled it. Absent while it waits, when it was cancelled, when that turn
     * ended without words, and on a run handled before runs kept them.
     */
    found: string().optional()
  });
  strictObject({
    id: string().min(1).optional(),
    name: string().max(80),
    spec: automationSpecSchema,
    prompt: string().min(1),
    /** The project its prompt is about; absent for none. */
    projectId: string().min(1).optional(),
    /**
     * The review's Turn on: the rule runs once saved. Without it a new rule
     * is saved as a draft, and an existing one keeps its state.
     */
    enable: boolean().optional(),
    /**
     * The person picked the event rule's integration again: it listens to
     * what that id stands for now, even when the id stands for another
     * connection than the one it was saved for.
     */
    reconnect: boolean().optional()
  });
  strictObject({ dates: array(number()) });
  const SCHEDULE_DETAILS = [
    { id: "time", label: "Scheduled time", token: "{{scheduled time}}" },
    { id: "zone", label: "Time zone", token: "{{time zone}}" },
    { id: "missed", label: "Missed runs", token: "{{missed runs}}" },
    { id: "events", label: "Events", token: "{{events}}" }
  ];
  function scheduledTimeWords(at, timeZone) {
    return new Date(at).toLocaleString(SERVED_LOCALE, {
      timeZone,
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short"
    });
  }
  function fillScheduleDetails(prompt, run) {
    const values = {
      time: scheduledTimeWords(run.plannedAt, run.timeZone),
      zone: run.timeZone,
      missed: String(run.missed),
      events: run.events ?? "none"
    };
    const events = SCHEDULE_DETAILS.find((detail) => detail.id === "events")?.token ?? "";
    const placed = run.events !== void 0 && !prompt.includes(events) ? `${prompt}

${events}` : prompt;
    return SCHEDULE_DETAILS.reduce(
      (text, detail) => text.split(detail.token).join(values[detail.id]),
      placed
    );
  }
  function isHigh(code) {
    return code >= 55296 && code <= 56319;
  }
  function isLow(code) {
    return code >= 56320 && code <= 57343;
  }
  function cutText(text, max) {
    if (text.length <= max) return text;
    const end = Math.max(0, max);
    if (end > 0 && isHigh(text.charCodeAt(end - 1)) && isLow(text.charCodeAt(end))) {
      return text.slice(0, end - 1);
    }
    return text.slice(0, end);
  }
  function automationEventsSkipped() {
    switch (currentLanguage()) {
      case "ar":
        return `أحداث متخطاة`;
      case "de":
        return `Übersprungene Ereignisse`;
      case "es":
        return `Eventos omitidos`;
      case "fr":
        return `Événements ignorés`;
      case "ja":
        return `スキップしたイベント`;
      case "ko":
        return `건너뛴 이벤트`;
      case "pt-BR":
        return `Eventos ignorados`;
      case "zh-Hans":
        return `已跳过的事件`;
      case "zh-Hant":
        return `已略過的事件`;
      case "en-XA":
        return `[Éṽéñţš šķîþþéð ~~~~~]`;
      case "ar-XB":
        return `‮Events skipped‬`;
    }
    return `Events skipped`;
  }
  function automationLooksFailing(input) {
    const since = input.since;
    switch (currentLanguage()) {
      case "ar":
        return `فشلت كل محاولة للبحث عن أحداث جديدة منذ ${since}، لذا لا يصل أي جديد إلى نائب القبطان. ستعمل من جديد تلقائيًا بمجرد نجاح إحدى المحاولات.`;
      case "de":
        return `Jede Suche nach neuen Ereignissen schlägt seit ${since} fehl, daher erreicht deinen ersten Offizier nichts Neues. Sie läuft von selbst wieder, sobald eine Suche gelingt.`;
      case "es":
        return `Cada consulta de eventos nuevos falla desde ${since}, así que no llega nada nuevo a tu primer oficial. Vuelve a funcionar sola en cuanto una consulta salga bien.`;
      case "fr":
        return `Chaque vérification des nouveaux événements échoue depuis ${since}, donc rien de nouveau n’arrive à votre second. Elle reprend d’elle-même dès qu’une vérification réussit.`;
      case "ja":
        return `${since} から新しいイベントの確認がすべて失敗しているため、一等航海士には何も届いていません。確認が成功すると自動的に再開します。`;
      case "ko":
        return `${since}부터 새 이벤트 확인이 모두 실패해 일등항해사에게 새로운 내용이 전달되지 않습니다. 확인이 성공하면 자동으로 다시 실행됩니다.`;
      case "pt-BR":
        return `Toda verificação de novos eventos falha desde ${since}, então nada novo chega ao seu imediato. Ela volta a funcionar sozinha assim que uma verificação der certo.`;
      case "zh-Hans":
        return `自 ${since} 起，每次查看新事件都失败了，因此大副收不到任何新内容。一旦查看成功，它会自动恢复运行。`;
      case "zh-Hant":
        return `自 ${since} 起，每次查看新事件都失敗了，因此大副收不到任何新內容。一旦查看成功，它會自動恢復執行。`;
      case "en-XA":
        return `[Éṽéŕý ļööķ ƒöŕ ñéŵ éṽéñţš ĥáš ƒáîļéð šîñçé ${since}, šö ñöţĥîñĝ ñéŵ ŕéáçĥéš ýöûŕ ƒîŕšţ ɱáţé. Îţ ŕûñš áĝáîñ ƀý îţšéļƒ öñçé á ļööķ ŵöŕķš. ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~]`;
      case "ar-XB":
        return `‮Every look for new events has failed since ‬${since}‮, so nothing new reaches your first mate. It runs again by itself once a look works.‬`;
    }
    return `Every look for new events has failed since ${since}, so nothing new reaches your first mate. It runs again by itself once a look works.`;
  }
  function automationLooksFailingAnswer(input) {
    const reason = input.reason;
    switch (currentLanguage()) {
      case "ar":
        return `أحدث رد: ${reason}`;
      case "de":
        return `Die neueste Antwort: ${reason}`;
      case "es":
        return `La respuesta más reciente: ${reason}`;
      case "fr":
        return `La réponse la plus récente : ${reason}`;
      case "ja":
        return `最新の応答: ${reason}`;
      case "ko":
        return `최근 응답: ${reason}`;
      case "pt-BR":
        return `A resposta mais recente: ${reason}`;
      case "zh-Hans":
        return `最新的回答：${reason}`;
      case "zh-Hant":
        return `最新的回覆：${reason}`;
      case "en-XA":
        return `[Ţĥé ñéŵéšţ áñšŵéŕ: ${reason} ~~~~~~~]`;
      case "ar-XB":
        return `‮The newest answer: ‬${reason}`;
    }
    return `The newest answer: ${reason}`;
  }
  function automationRunAlsoSkipped(input) {
    const count = input.count;
    switch (currentLanguage()) {
      case "ar":
        return `تُخطّي ${count}`;
      case "de":
        return `${count} übersprungen`;
      case "es":
        return `${count} omitidos`;
      case "fr":
        return `${count} ignoré(s)`;
      case "ja":
        return `${count}件スキップ`;
      case "ko":
        return `${count}개 건너뜀`;
      case "pt-BR":
        return `${count} ignorados`;
      case "zh-Hans":
        return `已跳过 ${count} 个`;
      case "zh-Hant":
        return `已略過 ${count} 個`;
      case "en-XA":
        return `[${count} šķîþþéð ~~~]`;
      case "ar-XB":
        return `${count}‮ skipped‬`;
    }
    return `${count} skipped`;
  }
  function automationRunSkipped(input) {
    const count = formatNumber(input.count);
    const date2 = input.date;
    switch (currentLanguage()) {
      case "ar":
        switch (pluralCategory(input.count)) {
          case "zero":
            return `لا أحداث، ${date2}`;
          case "one":
            return `حدث واحد، ${date2}`;
          case "two":
            return `حدثان، ${date2}`;
          case "few":
            return `${count} أحداث، ${date2}`;
          case "many":
            return `${count} حدثًا، ${date2}`;
          default:
            return `${count} حدث، ${date2}`;
        }
      case "de":
        switch (pluralCategory(input.count)) {
          case "one":
            return `${count} Ereignis, ${date2}`;
          default:
            return `${count} Ereignisse, ${date2}`;
        }
      case "es":
        switch (pluralCategory(input.count)) {
          case "one":
            return `${count} evento, ${date2}`;
          case "many":
            return `${count} de eventos, ${date2}`;
          default:
            return `${count} eventos, ${date2}`;
        }
      case "fr":
        switch (pluralCategory(input.count)) {
          case "one":
            return `${count} événement, ${date2}`;
          case "many":
            return `${count} d’événements, ${date2}`;
          default:
            return `${count} événements, ${date2}`;
        }
      case "ja":
        switch (pluralCategory(input.count)) {
          default:
            return `${count}件のイベント、${date2}`;
        }
      case "ko":
        switch (pluralCategory(input.count)) {
          default:
            return `이벤트 ${count}개, ${date2}`;
        }
      case "pt-BR":
        switch (pluralCategory(input.count)) {
          case "one":
            return `${count} evento, ${date2}`;
          case "many":
            return `${count} eventos, ${date2}`;
          default:
            return `${count} eventos, ${date2}`;
        }
      case "zh-Hans":
        switch (pluralCategory(input.count)) {
          default:
            return `${count} 个事件，${date2}`;
        }
      case "zh-Hant":
        switch (pluralCategory(input.count)) {
          default:
            return `${count} 個事件，${date2}`;
        }
      case "en-XA":
        switch (pluralCategory(input.count, "en")) {
          case "one":
            return `[${count} éṽéñţ, ${date2} ~~~]`;
          default:
            return `[${count} éṽéñţš, ${date2} ~~~]`;
        }
      case "ar-XB":
        switch (pluralCategory(input.count, "en")) {
          case "one":
            return `${count}‮ event, ‬${date2}`;
          default:
            return `${count}‮ events, ‬${date2}`;
        }
    }
    switch (pluralCategory(input.count)) {
      case "one":
        return `${count} event, ${date2}`;
      default:
        return `${count} events, ${date2}`;
    }
  }
  function automationRunSkippedState() {
    switch (currentLanguage()) {
      case "ar":
        return `متخطّى`;
      case "de":
        return `Übersprungen`;
      case "es":
        return `Omitido`;
      case "fr":
        return `Ignoré`;
      case "ja":
        return `スキップ`;
      case "ko":
        return `건너뜀`;
      case "pt-BR":
        return `Ignorado`;
      case "zh-Hans":
        return `已跳过`;
      case "zh-Hant":
        return `已略過`;
      case "en-XA":
        return `[Šķîþþéð ~~~]`;
      case "ar-XB":
        return `‮Skipped‬`;
    }
    return `Skipped`;
  }
  function automationScreenedNote() {
    switch (currentLanguage()) {
      case "ar":
        return `لم تُرسل إلى نائب القبطان: قرأ نموذج القرارات هذه الأحداث على أنها بوضوح لا تحقق شرط «فقط إذا» في هذه الأتمتة.`;
      case "de":
        return `Nicht an deinen ersten Offizier gesendet: Das Entscheidungsmodell hat diese Ereignisse als eindeutig nicht passend zur Nur-wenn-Bedingung dieser Automatisierung gelesen.`;
      case "es":
        return `No se envió a tu primer oficial: el modelo de decisión leyó estos eventos como claramente fuera de la condición Solo si de esta automatización.`;
      case "fr":
        return `Non envoyé à votre second : le modèle de décision a lu ces événements comme ne remplissant clairement pas la condition Seulement si de cette automatisation.`;
      case "ja":
        return `一等航海士には送っていません。判断モデルが、これらのイベントはこの自動化の条件に明らかに当てはまらないと判断しました。`;
      case "ko":
        return `일등항해사에게 보내지 않았어요. 결정 모델이 이 이벤트들은 이 자동화의 조건에 분명히 맞지 않는다고 판단했어요.`;
      case "pt-BR":
        return `Não enviado ao seu imediato: o modelo de decisão leu estes eventos como claramente fora da condição Somente se desta automação.`;
      case "zh-Hans":
        return `未发送给你的大副：决定模型认为这些事件明显不符合此自动化的“仅当”条件。`;
      case "zh-Hant":
        return `未傳送給你的大副：判斷模型認為這些事件明顯不符合此自動化的「僅當」條件。`;
      case "en-XA":
        return `[Ñöţ šéñţ ţö ýöûŕ ƒîŕšţ ɱáţé: ţĥé ðéçîšîöñ ɱöðéļ ŕéáð ţĥéšé éṽéñţš áš þļáîñļý ñöţ ɱééţîñĝ ţĥîš áûţöɱáţîöñ'š Öñļý îƒ çöñðîţîöñ. ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~]`;
      case "ar-XB":
        return `‮Not sent to your first mate: the decision model read these events as plainly not meeting this automation's Only if condition.‬`;
    }
    return `Not sent to your first mate: the decision model read these events as plainly not meeting this automation's Only if condition.`;
  }
  function automationStateFailing() {
    switch (currentLanguage()) {
      case "ar":
        return `تفشل`;
      case "de":
        return `Schlägt fehl`;
      case "es":
        return `Con fallos`;
      case "fr":
        return `En échec`;
      case "ja":
        return `失敗中`;
      case "ko":
        return `실패 중`;
      case "pt-BR":
        return `Com falha`;
      case "zh-Hans":
        return `失败中`;
      case "zh-Hant":
        return `失敗中`;
      case "en-XA":
        return `[Ƒáîļîñĝ ~~~]`;
      case "ar-XB":
        return `‮Failing‬`;
    }
    return `Failing`;
  }
  function automationWaitsFor() {
    switch (currentLanguage()) {
      case "ar":
        return `فقط إذا`;
      case "de":
        return `Nur wenn`;
      case "es":
        return `Solo si`;
      case "fr":
        return `Seulement si`;
      case "ja":
        return `条件`;
      case "ko":
        return `조건`;
      case "pt-BR":
        return `Somente se`;
      case "zh-Hans":
        return `仅当`;
      case "zh-Hant":
        return `僅當`;
      case "en-XA":
        return `[Öñļý îƒ ~~~]`;
      case "ar-XB":
        return `‮Only if‬`;
    }
    return `Only if`;
  }
  function automationWaitsForNote() {
    switch (currentLanguage()) {
      case "ar":
        return `لا يتصرف نائب القبطان إلا في الأحداث التي تحقق هذا الشرط. ما دام فرز الأحداث مفعّلًا في الإعدادات، فإن الحدث الذي لا يحقق هذا الشرط بوضوح لا يصل إلى نائب القبطان ويبقى مدرجًا في سجل هذه الأتمتة.`;
      case "de":
        return `Dein erster Offizier handelt nur bei Ereignissen, die dies erfüllen. Solange die Ereignisprüfung in den Einstellungen an ist, überspringt ein Ereignis, das dies eindeutig nicht erfüllt, deinen ersten Offizier und steht weiter im Verlauf dieser Automatisierung.`;
      case "es":
        return `Tu primer oficial solo actúa ante los eventos que cumplen esto. Mientras el filtro de eventos esté activado en Configuración, un evento que claramente no cumple esto no llega a tu primer oficial y sigue en el historial de esta automatización.`;
      case "fr":
        return `Votre second n’agit que sur les événements qui remplissent cette condition. Tant que le tri des événements est activé dans les Réglages, un événement qui ne remplit clairement pas cette condition ne passe pas par votre second et reste listé dans l’historique de cette automatisation.`;
      case "ja":
        return `一等航海士はこの条件に当てはまるイベントにだけ対応します。設定でイベントの選別がオンのあいだ、この条件に明らかに当てはまらないイベントは一等航海士に届かず、この自動化の履歴には残ります。`;
      case "ko":
        return `일등항해사는 이 조건에 맞는 이벤트에만 대응해요. 설정에서 이벤트 선별이 켜져 있는 동안, 이 조건에 분명히 맞지 않는 이벤트는 일등항해사에게 가지 않고 이 자동화의 기록에는 남아요.`;
      case "pt-BR":
        return `Seu imediato só age nos eventos que atendem a isto. Enquanto o filtro de eventos estiver ativado nos Ajustes, um evento que claramente não atende a isto não chega ao seu imediato e continua no histórico desta automação.`;
      case "zh-Hans":
        return `你的大副只会处理符合此条件的事件。在设置中开启事件筛选时，明显不符合此条件的事件不会交给你的大副，但仍列在此自动化的记录中。`;
      case "zh-Hant":
        return `你的大副只會處理符合此條件的事件。在設定中開啟事件篩選時，明顯不符合此條件的事件不會交給你的大副，但仍列在此自動化的紀錄中。`;
      case "en-XA":
        return `[Ýöûŕ ƒîŕšţ ɱáţé áçţš öñļý öñ éṽéñţš ţĥáţ ɱééţ ţĥîš. Ŵĥîļé ţĥé éṽéñţ šçŕééñ îš öñ îñ Šéţţîñĝš, áñ éṽéñţ ţĥáţ þļáîñļý ðöéš ñöţ ɱééţ ţĥîš šķîþš ýöûŕ ƒîŕšţ ɱáţé áñð îš šţîļļ ļîšţéð îñ ţĥîš áûţöɱáţîöñ'š ĥîšţöŕý. ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~]`;
      case "ar-XB":
        return `‮Your first mate acts only on events that meet this. While the event screen is on in Settings, an event that plainly does not meet this skips your first mate and is still listed in this automation's history.‬`;
    }
    return `Your first mate acts only on events that meet this. While the event screen is on in Settings, an event that plainly does not meet this skips your first mate and is still listed in this automation's history.`;
  }
  function devicesAwayUpdating() {
    switch (currentLanguage()) {
      case "ar":
        return `قيد التحديث`;
      case "de":
        return `in Aktualisierung`;
      case "es":
        return `actualizándose`;
      case "fr":
        return `en cours de mise à jour`;
      case "ja":
        return `更新中`;
      case "ko":
        return `업데이트 중`;
      case "pt-BR":
        return `atualizando`;
      case "zh-Hans":
        return `正在更新`;
      case "zh-Hant":
        return `正在更新`;
      case "en-XA":
        return `[ûþðáţîñĝ ~~~]`;
      case "ar-XB":
        return `‮updating‬`;
    }
    return `updating`;
  }
  function placeAs(input) {
    const user = input.user;
    switch (currentLanguage()) {
      case "ar":
        return `باسم ${user}`;
      case "de":
        return `als ${user}`;
      case "es":
        return `como ${user}`;
      case "fr":
        return `sous l’utilisateur ${user}`;
      case "ja":
        return ` ${user} として`;
      case "ko":
        return `${user}(으)로`;
      case "pt-BR":
        return `como ${user}`;
      case "zh-Hans":
        return `以 ${user} 身份`;
      case "zh-Hant":
        return `以 ${user} 身分`;
      case "en-XA":
        return `[áš ${user} ~]`;
      case "ar-XB":
        return `‮as ‬${user}`;
    }
    return `as ${user}`;
  }
  function placeOn(input) {
    const computer = input.computer;
    switch (currentLanguage()) {
      case "ar":
        return `على ${computer}`;
      case "de":
        return `auf ${computer}`;
      case "es":
        return `en ${computer}`;
      case "fr":
        return `sur ${computer}`;
      case "ja":
        return ` ${computer} で`;
      case "ko":
        return `${computer}에서`;
      case "pt-BR":
        return `em ${computer}`;
      case "zh-Hans":
        return `在 ${computer} 上`;
      case "zh-Hant":
        return `在 ${computer} 上`;
      case "en-XA":
        return `[öñ ${computer} ~]`;
      case "ar-XB":
        return `‮on ‬${computer}`;
    }
    return `on ${computer}`;
  }
  function placeOnOther() {
    switch (currentLanguage()) {
      case "ar":
        return `على الحاسوب الآخر`;
      case "de":
        return `auf dem anderen Computer`;
      case "es":
        return `en la otra computadora`;
      case "fr":
        return `sur l’autre ordinateur`;
      case "ja":
        return `別のコンピューターで`;
      case "ko":
        return `다른 컴퓨터에서`;
      case "pt-BR":
        return `no outro computador`;
      case "zh-Hans":
        return `在另一台电脑上`;
      case "zh-Hant":
        return `在另一台電腦上`;
      case "en-XA":
        return `[öñ ţĥé öţĥéŕ çöɱþûţéŕ ~~~~~~~]`;
      case "ar-XB":
        return `‮on the other computer‬`;
    }
    return `on the other computer`;
  }
  function placeOther() {
    switch (currentLanguage()) {
      case "ar":
        return `الحاسوب الآخر`;
      case "de":
        return `Der andere Computer`;
      case "es":
        return `La otra computadora`;
      case "fr":
        return `L’autre ordinateur`;
      case "ja":
        return `別のコンピューター`;
      case "ko":
        return `다른 컴퓨터`;
      case "pt-BR":
        return `O outro computador`;
      case "zh-Hans":
        return `另一台电脑`;
      case "zh-Hant":
        return `另一台電腦`;
      case "en-XA":
        return `[Ţĥé öţĥéŕ çöɱþûţéŕ ~~~~~~]`;
      case "ar-XB":
        return `‮The other computer‬`;
    }
    return `The other computer`;
  }
  function placeRunningAs(input) {
    const user = input.user;
    switch (currentLanguage()) {
      case "ar":
        return `التشغيل باسم ${user}`;
      case "de":
        return `Läuft als ${user}`;
      case "es":
        return `Se ejecuta como ${user}`;
      case "fr":
        return `Sous l’utilisateur ${user}`;
      case "ja":
        return `${user} として実行`;
      case "ko":
        return `${user}(으)로 실행`;
      case "pt-BR":
        return `Rodando como ${user}`;
      case "zh-Hans":
        return `以 ${user} 身份运行`;
      case "zh-Hant":
        return `以 ${user} 身分執行`;
      case "en-XA":
        return `[Ŕûññîñĝ áš ${user} ~~~~]`;
      case "ar-XB":
        return `‮Running as ‬${user}`;
    }
    return `Running as ${user}`;
  }
  function settingsAccountsCount(input) {
    const count = formatNumber(input.count);
    switch (currentLanguage()) {
      case "ar":
        switch (pluralCategory(input.count)) {
          case "zero":
            return `${count} حساب`;
          case "one":
            return `${count} حساب`;
          case "two":
            return `${count} حسابان`;
          case "few":
            return `${count} حسابات`;
          case "many":
            return `${count} حسابًا`;
          default:
            return `${count} حساب`;
        }
      case "de":
        switch (pluralCategory(input.count)) {
          case "one":
            return `${count} Konto`;
          default:
            return `${count} Konten`;
        }
      case "es":
        switch (pluralCategory(input.count)) {
          case "one":
            return `${count} cuenta`;
          case "many":
            return `${count} de cuentas`;
          default:
            return `${count} cuentas`;
        }
      case "fr":
        switch (pluralCategory(input.count)) {
          case "one":
            return `${count} compte`;
          case "many":
            return `${count} comptes`;
          default:
            return `${count} comptes`;
        }
      case "ja":
        switch (pluralCategory(input.count)) {
          default:
            return `${count}件のアカウント`;
        }
      case "ko":
        switch (pluralCategory(input.count)) {
          default:
            return `계정 ${count}개`;
        }
      case "pt-BR":
        switch (pluralCategory(input.count)) {
          case "one":
            return `${count} conta`;
          case "many":
            return `${count} contas`;
          default:
            return `${count} contas`;
        }
      case "zh-Hans":
        switch (pluralCategory(input.count)) {
          default:
            return `${count} 个账户`;
        }
      case "zh-Hant":
        switch (pluralCategory(input.count)) {
          default:
            return `${count} 個帳號`;
        }
      case "en-XA":
        switch (pluralCategory(input.count, "en")) {
          case "one":
            return `[${count} áççöûñţ ~~~]`;
          default:
            return `[${count} áççöûñţš ~~~]`;
        }
      case "ar-XB":
        switch (pluralCategory(input.count, "en")) {
          case "one":
            return `${count}‮ account‬`;
          default:
            return `${count}‮ accounts‬`;
        }
    }
    switch (pluralCategory(input.count)) {
      case "one":
        return `${count} account`;
      default:
        return `${count} accounts`;
    }
  }
  function settingsAccountsWaiting(input) {
    const accounts = input.accounts;
    const count = formatNumber(input.count);
    switch (currentLanguage()) {
      case "ar":
        switch (pluralCategory(input.count)) {
          case "zero":
            return `${accounts} · ${count} تحتاج إلى تسجيل الدخول`;
          case "one":
            return `${accounts} · ${count} يحتاج إلى تسجيل الدخول`;
          case "two":
            return `${accounts} · ${count} يحتاجان إلى تسجيل الدخول`;
          case "few":
            return `${accounts} · ${count} تحتاج إلى تسجيل الدخول`;
          case "many":
            return `${accounts} · ${count} تحتاج إلى تسجيل الدخول`;
          default:
            return `${accounts} · ${count} تحتاج إلى تسجيل الدخول`;
        }
      case "de":
        switch (pluralCategory(input.count)) {
          case "one":
            return `${accounts} · ${count} braucht eine Anmeldung`;
          default:
            return `${accounts} · ${count} brauchen eine Anmeldung`;
        }
      case "es":
        switch (pluralCategory(input.count)) {
          case "one":
            return `${accounts} · ${count} necesita iniciar sesión`;
          case "many":
            return `${accounts} · ${count} necesitan iniciar sesión`;
          default:
            return `${accounts} · ${count} necesitan iniciar sesión`;
        }
      case "fr":
        switch (pluralCategory(input.count)) {
          case "one":
            return `${accounts} · ${count} nécessite une connexion`;
          case "many":
            return `${accounts} · ${count} nécessitent une connexion`;
          default:
            return `${accounts} · ${count} nécessitent une connexion`;
        }
      case "ja":
        switch (pluralCategory(input.count)) {
          default:
            return `${accounts} · ${count}件はサインインが必要`;
        }
      case "ko":
        switch (pluralCategory(input.count)) {
          default:
            return `${accounts} · ${count}개 로그인 필요`;
        }
      case "pt-BR":
        switch (pluralCategory(input.count)) {
          case "one":
            return `${accounts} · ${count} precisa de login`;
          case "many":
            return `${accounts} · ${count} precisam de login`;
          default:
            return `${accounts} · ${count} precisam de login`;
        }
      case "zh-Hans":
        switch (pluralCategory(input.count)) {
          default:
            return `${accounts} · ${count} 个需要登录`;
        }
      case "zh-Hant":
        switch (pluralCategory(input.count)) {
          default:
            return `${accounts} · ${count} 個需要登入`;
        }
      case "en-XA":
        switch (pluralCategory(input.count, "en")) {
          case "one":
            return `[${accounts} · ${count} ñééðš á šîĝñ-îñ ~~~~~~~]`;
          default:
            return `[${accounts} · ${count} ñééð á šîĝñ-îñ ~~~~~~]`;
        }
      case "ar-XB":
        switch (pluralCategory(input.count, "en")) {
          case "one":
            return `${accounts}‮ · ‬${count}‮ needs a sign-in‬`;
          default:
            return `${accounts}‮ · ‬${count}‮ need a sign-in‬`;
        }
    }
    switch (pluralCategory(input.count)) {
      case "one":
        return `${accounts} · ${count} needs a sign-in`;
      default:
        return `${accounts} · ${count} need a sign-in`;
    }
  }
  function settingsAutomationBack() {
    switch (currentLanguage()) {
      case "ar":
        return `رجوع`;
      case "de":
        return `Zurück`;
      case "es":
        return `Atrás`;
      case "fr":
        return `Retour`;
      case "ja":
        return `戻る`;
      case "ko":
        return `뒤로`;
      case "pt-BR":
        return `Voltar`;
      case "zh-Hans":
        return `返回`;
      case "zh-Hant":
        return `返回`;
      case "en-XA":
        return `[Ɓáçķ ~~]`;
      case "ar-XB":
        return `‮Back‬`;
    }
    return `Back`;
  }
  function settingsAutomationCancelCleared() {
    switch (currentLanguage()) {
      case "ar":
        return `مُسحت محادثة نائب القبطان قبل أن يقرأ هذه.`;
      case "de":
        return `Die Unterhaltung deines ersten Offiziers wurde geleert, bevor er dies gelesen hat.`;
      case "es":
        return `La conversación de tu primer oficial se borró antes de que la leyera.`;
      case "fr":
        return `La conversation de votre second a été effacée avant qu’il ne lise ceci.`;
      case "ja":
        return `一等航海士がこれを読む前に、会話が消去されました。`;
      case "ko":
        return `일등항해사가 이것을 읽기 전에 일등항해사의 대화가 지워졌어요.`;
      case "pt-BR":
        return `A conversa do seu imediato foi apagada antes que ele lesse isto.`;
      case "zh-Hans":
        return `你的大副读到这条之前，它的对话已被清空。`;
      case "zh-Hant":
        return `你的大副讀到這則之前，它的對話已被清除。`;
      case "en-XA":
        return `[Ýöûŕ ƒîŕšţ ɱáţé'š çöñṽéŕšáţîöñ ŵáš çļéáŕéð ƀéƒöŕé îţ ŕéáð ţĥîš. ~~~~~~~~~~~~~~~~~~~~~]`;
      case "ar-XB":
        return `‮Your first mate's conversation was cleared before it read this.‬`;
    }
    return `Your first mate's conversation was cleared before it read this.`;
  }
  function settingsAutomationCancelEdited() {
    switch (currentLanguage()) {
      case "ar":
        return `سُحبت قبل أن يقرأها نائب القبطان، لأن الأتمتة تغيّرت.`;
      case "de":
        return `Zurückgenommen, bevor dein erster Offizier es gelesen hat, weil die Automatisierung geändert wurde.`;
      case "es":
        return `Se retiró antes de que tu primer oficial la leyera, porque se cambió la automatización.`;
      case "fr":
        return `Retirée avant que votre second ne la lise, car l’automatisation a été modifiée.`;
      case "ja":
        return `自動化が変更されたため、一等航海士が読む前に取り消されました。`;
      case "ko":
        return `자동화가 바뀌어서 일등항해사가 읽기 전에 거둬들였어요.`;
      case "pt-BR":
        return `Retirada antes que seu imediato a lesse, porque a automação foi alterada.`;
      case "zh-Hans":
        return `在你的大副读到之前已收回，因为这项自动化被更改了。`;
      case "zh-Hant":
        return `在你的大副讀到之前已收回，因為這項自動化已變更。`;
      case "en-XA":
        return `[Ţáķéñ ƀáçķ ƀéƒöŕé ýöûŕ ƒîŕšţ ɱáţé ŕéáð îţ, ƀéçáûšé ţĥé áûţöɱáţîöñ ŵáš çĥáñĝéð. ~~~~~~~~~~~~~~~~~~~~~~~~~~]`;
      case "ar-XB":
        return `‮Taken back before your first mate read it, because the automation was changed.‬`;
    }
    return `Taken back before your first mate read it, because the automation was changed.`;
  }
  function settingsAutomationCancelPaused() {
    switch (currentLanguage()) {
      case "ar":
        return `سُحبت قبل أن يقرأها نائب القبطان، لأن الأتمتة أُوقفت مؤقتًا.`;
      case "de":
        return `Zurückgenommen, bevor dein erster Offizier es gelesen hat, weil die Automatisierung pausiert wurde.`;
      case "es":
        return `Se retiró antes de que tu primer oficial la leyera, porque se pausó la automatización.`;
      case "fr":
        return `Retirée avant que votre second ne la lise, car l’automatisation a été mise en pause.`;
      case "ja":
        return `自動化が一時停止されたため、一等航海士が読む前に取り消されました。`;
      case "ko":
        return `자동화가 일시 정지되어서 일등항해사가 읽기 전에 거둬들였어요.`;
      case "pt-BR":
        return `Retirada antes que seu imediato a lesse, porque a automação foi pausada.`;
      case "zh-Hans":
        return `在你的大副读到之前已收回，因为这项自动化被暂停了。`;
      case "zh-Hant":
        return `在你的大副讀到之前已收回，因為這項自動化已暫停。`;
      case "en-XA":
        return `[Ţáķéñ ƀáçķ ƀéƒöŕé ýöûŕ ƒîŕšţ ɱáţé ŕéáð îţ, ƀéçáûšé ţĥé áûţöɱáţîöñ ŵáš þáûšéð. ~~~~~~~~~~~~~~~~~~~~~~~~~~]`;
      case "ar-XB":
        return `‮Taken back before your first mate read it, because the automation was paused.‬`;
    }
    return `Taken back before your first mate read it, because the automation was paused.`;
  }
  function settingsAutomationCard(input) {
    const title = input.title;
    switch (currentLanguage()) {
      case "ar":
        return `بطاقة: ${title}`;
      case "de":
        return `Karte: ${title}`;
      case "es":
        return `Tarjeta: ${title}`;
      case "fr":
        return `Carte : ${title}`;
      case "ja":
        return `カード：${title}`;
      case "ko":
        return `카드: ${title}`;
      case "pt-BR":
        return `Cartão: ${title}`;
      case "zh-Hans":
        return `卡片：${title}`;
      case "zh-Hant":
        return `卡片：${title}`;
      case "en-XA":
        return `[Çáŕð: ${title} ~~]`;
      case "ar-XB":
        return `‮Card: ‬${title}`;
    }
    return `Card: ${title}`;
  }
  function settingsAutomationClockHere() {
    switch (currentLanguage()) {
      case "ar":
        return `ساعة هذا الحاسوب`;
      case "de":
        return `Die Uhr dieses Computers`;
      case "es":
        return `El reloj de esta computadora`;
      case "fr":
        return `L’horloge de cet ordinateur`;
      case "ja":
        return `このコンピューターの時計`;
      case "ko":
        return `이 컴퓨터의 시계`;
      case "pt-BR":
        return `O relógio deste computador`;
      case "zh-Hans":
        return `这台电脑的时钟`;
      case "zh-Hant":
        return `這台電腦的時鐘`;
      case "en-XA":
        return `[Ţĥîš çöɱþûţéŕ'š çļöçķ ~~~~~~~]`;
      case "ar-XB":
        return `‮This computer's clock‬`;
    }
    return `This computer's clock`;
  }
  function settingsAutomationClockThere(input) {
    const where = input.where;
    switch (currentLanguage()) {
      case "ar":
        return `ساعة ${where}`;
      case "de":
        return `Die Uhr auf ${where}`;
      case "es":
        return `El reloj de ${where}`;
      case "fr":
        return `L’horloge de ${where}`;
      case "ja":
        return `${where} の時計`;
      case "ko":
        return `${where}의 시계`;
      case "pt-BR":
        return `O relógio de ${where}`;
      case "zh-Hans":
        return `${where} 上的时钟`;
      case "zh-Hant":
        return `${where} 上的時鐘`;
      case "en-XA":
        return `[Ţĥé çļöçķ öñ ${where} ~~~~~]`;
      case "ar-XB":
        return `‮The clock on ‬${where}`;
    }
    return `The clock on ${where}`;
  }
  function settingsAutomationDeliveryCancelled() {
    switch (currentLanguage()) {
      case "ar":
        return `أُلغيت`;
      case "de":
        return `Zurückgenommen`;
      case "es":
        return `Cancelada`;
      case "fr":
        return `Annulée`;
      case "ja":
        return `キャンセル済み`;
      case "ko":
        return `취소됨`;
      case "pt-BR":
        return `Cancelada`;
      case "zh-Hans":
        return `已取消`;
      case "zh-Hant":
        return `已取消`;
      case "en-XA":
        return `[Çáñçéļļéð ~~~]`;
      case "ar-XB":
        return `‮Cancelled‬`;
    }
    return `Cancelled`;
  }
  function settingsAutomationDeliveryHandled() {
    switch (currentLanguage()) {
      case "ar":
        return `عولجت`;
      case "de":
        return `Erledigt`;
      case "es":
        return `Atendida`;
      case "fr":
        return `Traitée`;
      case "ja":
        return `対応済み`;
      case "ko":
        return `처리됨`;
      case "pt-BR":
        return `Tratada`;
      case "zh-Hans":
        return `已处理`;
      case "zh-Hant":
        return `已處理`;
      case "en-XA":
        return `[Ĥáñðļéð ~~~]`;
      case "ar-XB":
        return `‮Handled‬`;
    }
    return `Handled`;
  }
  function settingsAutomationDeliveryRetrying() {
    switch (currentLanguage()) {
      case "ar":
        return `إعادة المحاولة`;
      case "de":
        return `Neuer Versuch`;
      case "es":
        return `Reintentando`;
      case "fr":
        return `Nouvel essai`;
      case "ja":
        return `再試行中`;
      case "ko":
        return `다시 시도 중`;
      case "pt-BR":
        return `Tentando de novo`;
      case "zh-Hans":
        return `正在重试`;
      case "zh-Hant":
        return `重試中`;
      case "en-XA":
        return `[Ŕéţŕýîñĝ ~~~]`;
      case "ar-XB":
        return `‮Retrying‬`;
    }
    return `Retrying`;
  }
  function settingsAutomationDeliverySent() {
    switch (currentLanguage()) {
      case "ar":
        return `أُرسلت`;
      case "de":
        return `Gesendet`;
      case "es":
        return `Enviada`;
      case "fr":
        return `Envoyée`;
      case "ja":
        return `送信済み`;
      case "ko":
        return `보냄`;
      case "pt-BR":
        return `Enviada`;
      case "zh-Hans":
        return `已发送`;
      case "zh-Hant":
        return `已送出`;
      case "en-XA":
        return `[Šéñţ ~~]`;
      case "ar-XB":
        return `‮Sent‬`;
    }
    return `Sent`;
  }
  function settingsAutomationDeliveryWaiting() {
    switch (currentLanguage()) {
      case "ar":
        return `في الانتظار`;
      case "de":
        return `Wartet`;
      case "es":
        return `En espera`;
      case "fr":
        return `En attente`;
      case "ja":
        return `待機中`;
      case "ko":
        return `대기 중`;
      case "pt-BR":
        return `Aguardando`;
      case "zh-Hans":
        return `等待中`;
      case "zh-Hant":
        return `等待中`;
      case "en-XA":
        return `[Ŵáîţîñĝ ~~~]`;
      case "ar-XB":
        return `‮Waiting‬`;
    }
    return `Waiting`;
  }
  function settingsAutomationDraftNote() {
    switch (currentLanguage()) {
      case "ar":
        return `المسودة لا تعمل أبدًا. اختر «تشغيل» لفحصها وتشغيلها.`;
      case "de":
        return `Ein Entwurf läuft nie. Wähl „Einschalten“, um ihn zu prüfen und einzuschalten.`;
      case "es":
        return `Un borrador nunca se ejecuta. Elige Activar para revisarlo y ponerlo en marcha.`;
      case "fr":
        return `Un brouillon ne s’exécute jamais. Choisissez Activer pour le vérifier et le mettre en marche.`;
      case "ja":
        return `下書きは実行されません。「オンにする」を選ぶと確認してオンにできます。`;
      case "ko":
        return `초안은 실행되지 않아요. 확인하고 켜려면 켜기를 고르세요.`;
      case "pt-BR":
        return `Um rascunho nunca roda. Escolha Ativar para verificá-lo e ligá-lo.`;
      case "zh-Hans":
        return `草稿从不运行。选择“打开”来检查并打开它。`;
      case "zh-Hant":
        return `草稿永遠不會執行。選擇「開啟」來檢查並開啟它。`;
      case "en-XA":
        return `[Å ðŕáƒţ ñéṽéŕ ŕûñš. Çĥööšé Ţûŕñ öñ ţö çĥéçķ îţ áñð ţûŕñ îţ öñ. ~~~~~~~~~~~~~~~~~~~~~]`;
      case "ar-XB":
        return `‮A draft never runs. Choose Turn on to check it and turn it on.‬`;
    }
    return `A draft never runs. Choose Turn on to check it and turn it on.`;
  }
  function settingsAutomationEnable() {
    switch (currentLanguage()) {
      case "ar":
        return `تشغيل…`;
      case "de":
        return `Einschalten …`;
      case "es":
        return `Activar…`;
      case "fr":
        return `Activer…`;
      case "ja":
        return `オンにする…`;
      case "ko":
        return `켜기…`;
      case "pt-BR":
        return `Ativar…`;
      case "zh-Hans":
        return `打开…`;
      case "zh-Hant":
        return `開啟…`;
      case "en-XA":
        return `[Ţûŕñ öñ… ~~~]`;
      case "ar-XB":
        return `‮Turn on…‬`;
    }
    return `Turn on…`;
  }
  function settingsAutomationEventsPreview() {
    switch (currentLanguage()) {
      case "ar":
        return `- (ملخص لكل حدث وصل)`;
      case "de":
        return `- (eine Zusammenfassung jedes eingetroffenen Ereignisses)`;
      case "es":
        return `- (un resumen de cada evento que llegó)`;
      case "fr":
        return `- (un résumé de chaque événement arrivé)`;
      case "ja":
        return `-（届いた各イベントの要約）`;
      case "ko":
        return `- (도착한 각 이벤트의 요약)`;
      case "pt-BR":
        return `- (um resumo de cada evento que chegou)`;
      case "zh-Hans":
        return `- （每个到达事件的摘要）`;
      case "zh-Hant":
        return `- （每個到達事件的摘要）`;
      case "en-XA":
        return `[- (á šûɱɱáŕý öƒ éáçĥ éṽéñţ ţĥáţ áŕŕîṽéð) ~~~~~~~~~~~~~~]`;
      case "ar-XB":
        return `‮- (a summary of each event that arrived)‬`;
    }
    return `- (a summary of each event that arrived)`;
  }
  function settingsAutomationFirstMateGets() {
    switch (currentLanguage()) {
      case "ar":
        return `ما يتلقاه نائب القبطان`;
      case "de":
        return `Dein erster Offizier bekommt`;
      case "es":
        return `Tu primer oficial recibe`;
      case "fr":
        return `Votre second reçoit`;
      case "ja":
        return `一等航海士が受け取る内容`;
      case "ko":
        return `일등항해사가 받는 것`;
      case "pt-BR":
        return `Seu imediato recebe`;
      case "zh-Hans":
        return `你的大副会收到`;
      case "zh-Hant":
        return `你的大副會收到`;
      case "en-XA":
        return `[Ýöûŕ ƒîŕšţ ɱáţé ĝéţš ~~~~~~~]`;
      case "ar-XB":
        return `‮Your first mate gets‬`;
    }
    return `Your first mate gets`;
  }
  function settingsAutomationHistory() {
    switch (currentLanguage()) {
      case "ar":
        return `السجل`;
      case "de":
        return `Verlauf`;
      case "es":
        return `Historial`;
      case "fr":
        return `Historique`;
      case "ja":
        return `履歴`;
      case "ko":
        return `기록`;
      case "pt-BR":
        return `Histórico`;
      case "zh-Hans":
        return `历史`;
      case "zh-Hant":
        return `歷史紀錄`;
      case "en-XA":
        return `[Ĥîšţöŕý ~~~]`;
      case "ar-XB":
        return `‮History‬`;
    }
    return `History`;
  }
  function settingsAutomationLedTo() {
    switch (currentLanguage()) {
      case "ar":
        return `أدّت إلى`;
      case "de":
        return `Führte zu`;
      case "es":
        return `Dio lugar a`;
      case "fr":
        return `A mené à`;
      case "ja":
        return `結果`;
      case "ko":
        return `결과`;
      case "pt-BR":
        return `Resultou em`;
      case "zh-Hans":
        return `带来了`;
      case "zh-Hant":
        return `帶來了`;
      case "en-XA":
        return `[Ļéð ţö ~~]`;
      case "ar-XB":
        return `‮Led to‬`;
    }
    return `Led to`;
  }
  function settingsAutomationLocalTimeNote() {
    switch (currentLanguage()) {
      case "ar":
        return `تتبع هذه الأتمتة ساعة هذا الحاسوب، لذا يتغير وقتها حين تسافر. اختر منطقة زمنية لتثبيته.`;
      case "de":
        return `Diese Automatisierung folgt der Uhr dieses Computers und verschiebt sich daher, wenn du reist. Wähl eine Zeitzone, damit sie fest bleibt.`;
      case "es":
        return `Esta automatización sigue el reloj de esta computadora, así que cambia cuando viajas. Elige una zona horaria para dejarla fija.`;
      case "fr":
        return `Cette automatisation suit l’horloge de cet ordinateur : elle se décale quand vous voyagez. Choisissez un fuseau horaire pour la garder fixe.`;
      case "ja":
        return `この自動化はこのコンピューターの時計に従うため、移動すると時刻も変わります。固定するにはタイムゾーンを選んでください。`;
      case "ko":
        return `이 자동화는 이 컴퓨터의 시계를 따르므로, 선장님이 이동하면 시각도 바뀌어요. 고정하려면 시간대를 고르세요.`;
      case "pt-BR":
        return `Esta automação segue o relógio deste computador, então muda quando você viaja. Escolha um fuso horário para mantê-la fixa.`;
      case "zh-Hans":
        return `这项自动化跟随这台电脑的时钟，所以你出行时它会跟着变。选择一个时区可以让它保持固定。`;
      case "zh-Hant":
        return `這項自動化跟隨這台電腦的時鐘，所以你旅行時它也會跟著變。選擇一個時區就能讓它固定。`;
      case "en-XA":
        return `[Ţĥîš áûţöɱáţîöñ ƒöļļöŵš ţĥîš çöɱþûţéŕ'š çļöçķ, šö îţ ɱöṽéš ŵĥéñ ýöû ţŕáṽéļ. Þîçķ á ţîɱé žöñé ţö ķééþ îţ ƒîẋéð. ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~]`;
      case "ar-XB":
        return `‮This automation follows this computer's clock, so it moves when you travel. Pick a time zone to keep it fixed.‬`;
    }
    return `This automation follows this computer's clock, so it moves when you travel. Pick a time zone to keep it fixed.`;
  }
  function settingsAutomationLocalTimeNoteThere(input) {
    const where = input.where;
    switch (currentLanguage()) {
      case "ar":
        return `تتبع هذه الأتمتة ساعة ${where}، لذا يتغير وقتها حين يسافر ذلك الحاسوب. اختر منطقة زمنية لتثبيته.`;
      case "de":
        return `Diese Automatisierung folgt der Uhr auf ${where} und verschiebt sich daher, wenn dieser Computer reist. Wähl eine Zeitzone, damit sie fest bleibt.`;
      case "es":
        return `Esta automatización sigue el reloj de ${where}, así que cambia cuando esa computadora viaja. Elige una zona horaria para dejarla fija.`;
      case "fr":
        return `Cette automatisation suit l’horloge de ${where} : elle se décale quand cet ordinateur voyage. Choisissez un fuseau horaire pour la garder fixe.`;
      case "ja":
        return `この自動化は ${where} の時計に従うため、そのコンピューターが移動すると時刻も変わります。固定するにはタイムゾーンを選んでください。`;
      case "ko":
        return `이 자동화는 ${where}의 시계를 따르므로, 그 컴퓨터가 이동하면 시각도 바뀌어요. 고정하려면 시간대를 고르세요.`;
      case "pt-BR":
        return `Esta automação segue o relógio de ${where}, então muda quando esse computador viaja. Escolha um fuso horário para mantê-la fixa.`;
      case "zh-Hans":
        return `这项自动化跟随 ${where} 上的时钟，所以那台电脑出行时它会跟着变。选择一个时区可以让它保持固定。`;
      case "zh-Hant":
        return `這項自動化跟隨 ${where} 上的時鐘，所以那台電腦移動到別的時區時它也會跟著變。選擇一個時區就能讓它固定。`;
      case "en-XA":
        return `[Ţĥîš áûţöɱáţîöñ ƒöļļöŵš ţĥé çļöçķ öñ ${where}, šö îţ ɱöṽéš ŵĥéñ ţĥáţ çöɱþûţéŕ ţŕáṽéļš. Þîçķ á ţîɱé žöñé ţö ķééþ îţ ƒîẋéð. ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~]`;
      case "ar-XB":
        return `‮This automation follows the clock on ‬${where}‮, so it moves when that computer travels. Pick a time zone to keep it fixed.‬`;
    }
    return `This automation follows the clock on ${where}, so it moves when that computer travels. Pick a time zone to keep it fixed.`;
  }
  function settingsAutomationMissedEvent() {
    switch (currentLanguage()) {
      case "ar":
        return `إذا كان Infinitary مغلقًا أو كان الحاسوب نائمًا، يُرسَل ما وصل في أثناء ذلك مرة واحدة عند عودته.`;
      case "de":
        return `Wenn Infinitary geschlossen ist oder der Computer schläft, wird das in der Zwischenzeit Eingetroffene einmal gesendet, sobald er zurück ist.`;
      case "es":
        return `Si Infinitary está cerrado o la computadora está en reposo, lo que llegó mientras tanto se envía una sola vez cuando vuelve.`;
      case "fr":
        return `Si Infinitary est fermé ou si l’ordinateur est en veille, ce qui est arrivé entre-temps est envoyé en une seule fois à son retour.`;
      case "ja":
        return `Infinitary が閉じているかコンピューターがスリープ中の場合、その間に届いたものは復帰時にまとめて1回送信されます。`;
      case "ko":
        return `Infinitary가 닫혀 있거나 컴퓨터가 잠자기 상태이면, 그동안 온 것은 돌아왔을 때 한 번에 보내요.`;
      case "pt-BR":
        return `Se o Infinitary estiver fechado ou o computador estiver em repouso, o que chegou nesse meio-tempo é enviado uma vez quando ele voltar.`;
      case "zh-Hans":
        return `如果 Infinitary 已关闭或电脑处于睡眠状态，期间到达的内容会在它恢复后一次性发送。`;
      case "zh-Hant":
        return `如果 Infinitary 已關閉或電腦正在睡眠，期間到達的內容會在它恢復後一次送出。`;
      case "en-XA":
        return `[Îƒ Îñƒîñîţáŕý îš çļöšéð öŕ ţĥé çöɱþûţéŕ îš ášļééþ, ŵĥáţ áŕŕîṽéð ɱéáñŵĥîļé îš šéñţ öñçé ŵĥéñ îţ ŕéţûŕñš. ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~]`;
      case "ar-XB":
        return `‮If Infinitary is closed or the computer is asleep, what arrived meanwhile is sent once when it returns.‬`;
    }
    return `If Infinitary is closed or the computer is asleep, what arrived meanwhile is sent once when it returns.`;
  }
  function settingsAutomationMissedEventThere(input) {
    const where = input.where;
    switch (currentLanguage()) {
      case "ar":
        return `إذا كان Infinitary مغلقًا على ${where} أو كان الحاسوب نائمًا، يُرسَل ما وصل في أثناء ذلك مرة واحدة عند عودته.`;
      case "de":
        return `Wenn Infinitary auf ${where} geschlossen ist oder der Computer schläft, wird das in der Zwischenzeit Eingetroffene einmal gesendet, sobald er zurück ist.`;
      case "es":
        return `Si Infinitary está cerrado en ${where} o la computadora está en reposo, lo que llegó mientras tanto se envía una sola vez cuando vuelve.`;
      case "fr":
        return `Si Infinitary est fermé sur ${where} ou si l’ordinateur est en veille, ce qui est arrivé entre-temps est envoyé en une seule fois à son retour.`;
      case "ja":
        return `${where} の Infinitary が閉じているかコンピューターがスリープ中の場合、その間に届いたものは復帰時にまとめて1回送信されます。`;
      case "ko":
        return `${where}에서 Infinitary가 닫혀 있거나 컴퓨터가 잠자기 상태이면, 그동안 온 것은 돌아왔을 때 한 번에 보내요.`;
      case "pt-BR":
        return `Se o Infinitary estiver fechado em ${where} ou o computador estiver em repouso, o que chegou nesse meio-tempo é enviado uma vez quando ele voltar.`;
      case "zh-Hans":
        return `如果 ${where} 上的 Infinitary 已关闭或电脑处于睡眠状态，期间到达的内容会在它恢复后一次性发送。`;
      case "zh-Hant":
        return `如果 ${where} 上的 Infinitary 已關閉或電腦正在睡眠，期間到達的內容會在它恢復後一次送出。`;
      case "en-XA":
        return `[Îƒ Îñƒîñîţáŕý îš çļöšéð öñ ${where} öŕ ţĥé çöɱþûţéŕ îš ášļééþ, ŵĥáţ áŕŕîṽéð ɱéáñŵĥîļé îš šéñţ öñçé ŵĥéñ îţ ŕéţûŕñš. ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~]`;
      case "ar-XB":
        return `‮If Infinitary is closed on ‬${where}‮ or the computer is asleep, what arrived meanwhile is sent once when it returns.‬`;
    }
    return `If Infinitary is closed on ${where} or the computer is asleep, what arrived meanwhile is sent once when it returns.`;
  }
  function settingsAutomationMissedOnce() {
    switch (currentLanguage()) {
      case "ar":
        return `إذا كان Infinitary مغلقًا في ذلك الوقت، فستعمل مرة واحدة عند فتح Infinitary.`;
      case "de":
        return `Wenn Infinitary zu dieser Zeit geschlossen ist, läuft es einmal, sobald Infinitary geöffnet wird.`;
      case "es":
        return `Si Infinitary está cerrado a esa hora, se ejecuta en cuanto Infinitary se abre.`;
      case "fr":
        return `Si Infinitary est fermé à ce moment-là, elle s’exécute dès qu’Infinitary s’ouvre.`;
      case "ja":
        return `その時刻に Infinitary が閉じていた場合は、Infinitary が開いたときに1回実行します。`;
      case "ko":
        return `그 시간에 Infinitary가 닫혀 있으면, Infinitary가 열릴 때 한 번 실행해요.`;
      case "pt-BR":
        return `Se o Infinitary estiver fechado nesse horário, ela roda assim que o Infinitary abrir.`;
      case "zh-Hans":
        return `如果当时 Infinitary 已关闭，它会在 Infinitary 打开后运行一次。`;
      case "zh-Hant":
        return `如果當時 Infinitary 已關閉，它會在 Infinitary 開啟後執行一次。`;
      case "en-XA":
        return `[Îƒ Îñƒîñîţáŕý îš çļöšéð áţ ţĥáţ ţîɱé, îţ ŕûñš öñçé Îñƒîñîţáŕý öþéñš. ~~~~~~~~~~~~~~~~~~~~~~~]`;
      case "ar-XB":
        return `‮If Infinitary is closed at that time, it runs once Infinitary opens.‬`;
    }
    return `If Infinitary is closed at that time, it runs once Infinitary opens.`;
  }
  function settingsAutomationMissedOnceThere(input) {
    const where = input.where;
    switch (currentLanguage()) {
      case "ar":
        return `إذا كان Infinitary مغلقًا على ${where} في ذلك الوقت، فستعمل مرة واحدة عند فتح Infinitary.`;
      case "de":
        return `Wenn Infinitary zu dieser Zeit auf ${where} geschlossen ist, läuft es einmal, sobald Infinitary geöffnet wird.`;
      case "es":
        return `Si Infinitary está cerrado en ${where} a esa hora, se ejecuta en cuanto Infinitary se abre.`;
      case "fr":
        return `Si Infinitary est fermé sur ${where} à ce moment-là, elle s’exécute dès qu’Infinitary s’ouvre.`;
      case "ja":
        return `その時刻に ${where} の Infinitary が閉じていた場合は、Infinitary が開いたときに1回実行します。`;
      case "ko":
        return `그 시간에 ${where}에서 Infinitary가 닫혀 있으면, Infinitary가 열릴 때 한 번 실행해요.`;
      case "pt-BR":
        return `Se o Infinitary estiver fechado em ${where} nesse horário, ela roda assim que o Infinitary abrir.`;
      case "zh-Hans":
        return `如果当时 ${where} 上的 Infinitary 已关闭，它会在 Infinitary 打开后运行一次。`;
      case "zh-Hant":
        return `如果當時 ${where} 上的 Infinitary 已關閉，它會在 Infinitary 開啟後執行一次。`;
      case "en-XA":
        return `[Îƒ Îñƒîñîţáŕý îš çļöšéð öñ ${where} áţ ţĥáţ ţîɱé, îţ ŕûñš öñçé Îñƒîñîţáŕý öþéñš. ~~~~~~~~~~~~~~~~~~~~~~~~]`;
      case "ar-XB":
        return `‮If Infinitary is closed on ‬${where}‮ at that time, it runs once Infinitary opens.‬`;
    }
    return `If Infinitary is closed on ${where} at that time, it runs once Infinitary opens.`;
  }
  function settingsAutomationMissedRepeats() {
    switch (currentLanguage()) {
      case "ar":
        return `إذا كان Infinitary مغلقًا أو كان الحاسوب نائمًا، تُنفَّذ عمليات التشغيل الفائتة مرة واحدة عند عودته، مع عددها.`;
      case "de":
        return `Wenn Infinitary geschlossen ist oder der Computer schläft, werden die verpassten Läufe einmal nachgeholt, sobald er zurück ist, mit der Angabe, wie viele es waren.`;
      case "es":
        return `Si Infinitary está cerrado o la computadora está en reposo, las ejecuciones perdidas se hacen una sola vez cuando vuelve, indicando cuántas se perdieron.`;
      case "fr":
        return `Si Infinitary est fermé ou si l’ordinateur est en veille, les exécutions manquées ont lieu une seule fois à son retour, avec leur nombre.`;
      case "ja":
        return `Infinitary が閉じているかコンピューターがスリープ中の場合、逃した実行は復帰時に、逃した回数を添えてまとめて1回行われます。`;
      case "ko":
        return `Infinitary가 닫혀 있거나 컴퓨터가 잠자기 상태이면, 놓친 실행은 돌아왔을 때 몇 번 놓쳤는지와 함께 한 번 실행해요.`;
      case "pt-BR":
        return `Se o Infinitary estiver fechado ou o computador estiver em repouso, as execuções perdidas acontecem uma vez quando ele voltar, informando quantas foram perdidas.`;
      case "zh-Hans":
        return `如果 Infinitary 已关闭或电脑处于睡眠状态，错过的运行会在它恢复后合并运行一次，并注明错过了几次。`;
      case "zh-Hant":
        return `如果 Infinitary 已關閉或電腦正在睡眠，錯過的執行會在它恢復後合併執行一次，並註明錯過了幾次。`;
      case "en-XA":
        return `[Îƒ Îñƒîñîţáŕý îš çļöšéð öŕ ţĥé çöɱþûţéŕ îš ášļééþ, ţĥé ŕûñš îţ ɱîššéð ĥáþþéñ öñçé ŵĥéñ îţ ŕéţûŕñš, ŵîţĥ ĥöŵ ɱáñý îţ ɱîššéð. ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~]`;
      case "ar-XB":
        return `‮If Infinitary is closed or the computer is asleep, the runs it missed happen once when it returns, with how many it missed.‬`;
    }
    return `If Infinitary is closed or the computer is asleep, the runs it missed happen once when it returns, with how many it missed.`;
  }
  function settingsAutomationMissedRepeatsThere(input) {
    const where = input.where;
    switch (currentLanguage()) {
      case "ar":
        return `إذا كان Infinitary مغلقًا على ${where} أو كان الحاسوب نائمًا، تُنفَّذ عمليات التشغيل الفائتة مرة واحدة عند عودته، مع عددها.`;
      case "de":
        return `Wenn Infinitary auf ${where} geschlossen ist oder der Computer schläft, werden die verpassten Läufe einmal nachgeholt, sobald er zurück ist, mit der Angabe, wie viele es waren.`;
      case "es":
        return `Si Infinitary está cerrado en ${where} o la computadora está en reposo, las ejecuciones perdidas se hacen una sola vez cuando vuelve, indicando cuántas se perdieron.`;
      case "fr":
        return `Si Infinitary est fermé sur ${where} ou si l’ordinateur est en veille, les exécutions manquées ont lieu une seule fois à son retour, avec leur nombre.`;
      case "ja":
        return `${where} の Infinitary が閉じているかコンピューターがスリープ中の場合、逃した実行は復帰時に、逃した回数を添えてまとめて1回行われます。`;
      case "ko":
        return `${where}에서 Infinitary가 닫혀 있거나 컴퓨터가 잠자기 상태이면, 놓친 실행은 돌아왔을 때 몇 번 놓쳤는지와 함께 한 번 실행해요.`;
      case "pt-BR":
        return `Se o Infinitary estiver fechado em ${where} ou o computador estiver em repouso, as execuções perdidas acontecem uma vez quando ele voltar, informando quantas foram perdidas.`;
      case "zh-Hans":
        return `如果 ${where} 上的 Infinitary 已关闭或电脑处于睡眠状态，错过的运行会在它恢复后合并运行一次，并注明错过了几次。`;
      case "zh-Hant":
        return `如果 ${where} 上的 Infinitary 已關閉或電腦正在睡眠，錯過的執行會在它恢復後合併執行一次，並註明錯過了幾次。`;
      case "en-XA":
        return `[Îƒ Îñƒîñîţáŕý îš çļöšéð öñ ${where} öŕ ţĥé çöɱþûţéŕ îš ášļééþ, ţĥé ŕûñš îţ ɱîššéð ĥáþþéñ öñçé ŵĥéñ îţ ŕéţûŕñš, ŵîţĥ ĥöŵ ɱáñý îţ ɱîššéð. ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~]`;
      case "ar-XB":
        return `‮If Infinitary is closed on ‬${where}‮ or the computer is asleep, the runs it missed happen once when it returns, with how many it missed.‬`;
    }
    return `If Infinitary is closed on ${where} or the computer is asleep, the runs it missed happen once when it returns, with how many it missed.`;
  }
  function settingsAutomationMissedTime() {
    switch (currentLanguage()) {
      case "ar":
        return `وقت فائت`;
      case "de":
        return `Eine verpasste Zeit`;
      case "es":
        return `Una ejecución perdida`;
      case "fr":
        return `Une exécution manquée`;
      case "ja":
        return `逃した時刻`;
      case "ko":
        return `놓친 시간`;
      case "pt-BR":
        return `Uma execução perdida`;
      case "zh-Hans":
        return `错过的时间`;
      case "zh-Hant":
        return `錯過的時間`;
      case "en-XA":
        return `[Å ɱîššéð ţîɱé ~~~~~]`;
      case "ar-XB":
        return `‮A missed time‬`;
    }
    return `A missed time`;
  }
  function settingsAutomationNextRuns() {
    switch (currentLanguage()) {
      case "ar":
        return `عمليات التشغيل التالية`;
      case "de":
        return `Nächste Läufe`;
      case "es":
        return `Próximas ejecuciones`;
      case "fr":
        return `Prochaines exécutions`;
      case "ja":
        return `次回以降の実行`;
      case "ko":
        return `다음 실행`;
      case "pt-BR":
        return `Próximas execuções`;
      case "zh-Hans":
        return `接下来的运行`;
      case "zh-Hant":
        return `接下來的執行`;
      case "en-XA":
        return `[Ñéẋţ ŕûñš ~~~]`;
      case "ar-XB":
        return `‮Next runs‬`;
    }
    return `Next runs`;
  }
  function settingsAutomationNoProject() {
    switch (currentLanguage()) {
      case "ar":
        return `بلا مشروع`;
      case "de":
        return `Kein Projekt`;
      case "es":
        return `Sin proyecto`;
      case "fr":
        return `Aucun projet`;
      case "ja":
        return `プロジェクトなし`;
      case "ko":
        return `프로젝트 없음`;
      case "pt-BR":
        return `Sem projeto`;
      case "zh-Hans":
        return `无项目`;
      case "zh-Hant":
        return `沒有專案`;
      case "en-XA":
        return `[Ñö þŕöĵéçţ ~~~~]`;
      case "ar-XB":
        return `‮No project‬`;
    }
    return `No project`;
  }
  function settingsAutomationNotSpecified() {
    switch (currentLanguage()) {
      case "ar":
        return `غير محدد`;
      case "de":
        return `Nicht angegeben`;
      case "es":
        return `Sin especificar`;
      case "fr":
        return `Non précisé`;
      case "ja":
        return `指定なし`;
      case "ko":
        return `지정 안 됨`;
      case "pt-BR":
        return `Não especificado`;
      case "zh-Hans":
        return `未指定`;
      case "zh-Hant":
        return `未指定`;
      case "en-XA":
        return `[Ñöţ šþéçîƒîéð ~~~~~]`;
      case "ar-XB":
        return `‮Not specified‬`;
    }
    return `Not specified`;
  }
  function settingsAutomationNoteCancelled() {
    switch (currentLanguage()) {
      case "ar":
        return `سُحبت قبل أن يقرأها نائب القبطان.`;
      case "de":
        return `Zurückgenommen, bevor dein erster Offizier es gelesen hat.`;
      case "es":
        return `Se retiró antes de que tu primer oficial la leyera.`;
      case "fr":
        return `Retirée avant que votre second ne la lise.`;
      case "ja":
        return `一等航海士が読む前に取り消されました。`;
      case "ko":
        return `일등항해사가 읽기 전에 거둬들였어요.`;
      case "pt-BR":
        return `Retirada antes que seu imediato a lesse.`;
      case "zh-Hans":
        return `在你的大副读到之前已收回。`;
      case "zh-Hant":
        return `在你的大副讀到之前已收回。`;
      case "en-XA":
        return `[Ţáķéñ ƀáçķ ƀéƒöŕé ýöûŕ ƒîŕšţ ɱáţé ŕéáð îţ. ~~~~~~~~~~~~~~]`;
      case "ar-XB":
        return `‮Taken back before your first mate read it.‬`;
    }
    return `Taken back before your first mate read it.`;
  }
  function settingsAutomationNoteHandledAt(input) {
    const time2 = input.time;
    switch (currentLanguage()) {
      case "ar":
        return `عالجها نائب القبطان في ${time2}.`;
      case "de":
        return `Dein erster Offizier hat es um ${time2} bearbeitet.`;
      case "es":
        return `Tu primer oficial la atendió a las ${time2}.`;
      case "fr":
        return `Votre second l’a traitée à ${time2}.`;
      case "ja":
        return `一等航海士が ${time2} に対応しました。`;
      case "ko":
        return `일등항해사가 ${time2}에 처리했어요.`;
      case "pt-BR":
        return `Seu imediato tratou dela às ${time2}.`;
      case "zh-Hans":
        return `你的大副已在 ${time2} 处理。`;
      case "zh-Hant":
        return `你的大副已在 ${time2} 處理。`;
      case "en-XA":
        return `[Ýöûŕ ƒîŕšţ ɱáţé ĥáñðļéð îţ áţ ${time2}. ~~~~~~~~~~~]`;
      case "ar-XB":
        return `‮Your first mate handled it at ‬${time2}‮.‬`;
    }
    return `Your first mate handled it at ${time2}.`;
  }
  function settingsAutomationNoteHandledOn(input) {
    const date2 = input.date;
    switch (currentLanguage()) {
      case "ar":
        return `عالجها نائب القبطان في ${date2}.`;
      case "de":
        return `Dein erster Offizier hat es am ${date2} bearbeitet.`;
      case "es":
        return `Tu primer oficial la atendió el ${date2}.`;
      case "fr":
        return `Votre second l’a traitée le ${date2}.`;
      case "ja":
        return `一等航海士が ${date2} に対応しました。`;
      case "ko":
        return `일등항해사가 ${date2}에 처리했어요.`;
      case "pt-BR":
        return `Seu imediato tratou dela em ${date2}.`;
      case "zh-Hans":
        return `你的大副已在 ${date2} 处理。`;
      case "zh-Hant":
        return `你的大副已在 ${date2} 處理。`;
      case "en-XA":
        return `[Ýöûŕ ƒîŕšţ ɱáţé ĥáñðļéð îţ öñ ${date2}. ~~~~~~~~~~~]`;
      case "ar-XB":
        return `‮Your first mate handled it on ‬${date2}‮.‬`;
    }
    return `Your first mate handled it on ${date2}.`;
  }
  function settingsAutomationNoteRetrying() {
    switch (currentLanguage()) {
      case "ar":
        return `لم يتمكن نائب القبطان من استلامها بعد. تجري إعادة المحاولة.`;
      case "de":
        return `Dein erster Offizier konnte es noch nicht annehmen. Es wird erneut versucht.`;
      case "es":
        return `Tu primer oficial todavía no pudo recibirla. Se está volviendo a intentar.`;
      case "fr":
        return `Votre second n’a pas encore pu la prendre. Un nouvel essai est en cours.`;
      case "ja":
        return `一等航海士がまだ受け取れませんでした。もう一度試しています。`;
      case "ko":
        return `일등항해사가 아직 받을 수 없었어요. 다시 시도하고 있어요.`;
      case "pt-BR":
        return `Seu imediato ainda não conseguiu recebê-la. Uma nova tentativa está em andamento.`;
      case "zh-Hans":
        return `你的大副暂时无法接收，正在再次尝试。`;
      case "zh-Hant":
        return `你的大副暫時無法接收，正在再試一次。`;
      case "en-XA":
        return `[Ýöûŕ ƒîŕšţ ɱáţé çöûļð ñöţ ţáķé îţ ýéţ. Îţ îš ƀéîñĝ ţŕîéð áĝáîñ. ~~~~~~~~~~~~~~~~~~~~~]`;
      case "ar-XB":
        return `‮Your first mate could not take it yet. It is being tried again.‬`;
    }
    return `Your first mate could not take it yet. It is being tried again.`;
  }
  function settingsAutomationNoteWaiting() {
    switch (currentLanguage()) {
      case "ar":
        return `لم يعالجها نائب القبطان بعد.`;
      case "de":
        return `Dein erster Offizier hat es noch nicht bearbeitet.`;
      case "es":
        return `Tu primer oficial todavía no la ha atendido.`;
      case "fr":
        return `Votre second ne l’a pas encore traitée.`;
      case "ja":
        return `一等航海士はまだ対応していません。`;
      case "ko":
        return `일등항해사가 아직 처리하지 않았어요.`;
      case "pt-BR":
        return `Seu imediato ainda não tratou dela.`;
      case "zh-Hans":
        return `你的大副还没有处理它。`;
      case "zh-Hant":
        return `你的大副還沒處理它。`;
      case "en-XA":
        return `[Ýöûŕ ƒîŕšţ ɱáţé ĥáš ñöţ ĥáñðļéð îţ ýéţ. ~~~~~~~~~~~~~]`;
      case "ar-XB":
        return `‮Your first mate has not handled it yet.‬`;
    }
    return `Your first mate has not handled it yet.`;
  }
  function settingsAutomationNothingRun() {
    switch (currentLanguage()) {
      case "ar":
        return `لم يعمل شيء بعد.`;
      case "de":
        return `Bisher ist nichts gelaufen.`;
      case "es":
        return `Todavía no se ha ejecutado nada.`;
      case "fr":
        return `Rien ne s’est encore exécuté.`;
      case "ja":
        return `まだ何も実行されていません。`;
      case "ko":
        return `아직 실행된 것이 없어요.`;
      case "pt-BR":
        return `Nada foi executado ainda.`;
      case "zh-Hans":
        return `还没有运行过。`;
      case "zh-Hant":
        return `還沒有執行過。`;
      case "en-XA":
        return `[Ñöţĥîñĝ ĥáš ŕûñ ýéţ. ~~~~~~~]`;
      case "ar-XB":
        return `‮Nothing has run yet.‬`;
    }
    return `Nothing has run yet.`;
  }
  function settingsAutomationPassed() {
    switch (currentLanguage()) {
      case "ar":
        return `لقد مضى ذلك الوقت بالفعل.`;
      case "de":
        return `Diese Zeit ist schon vorbei.`;
      case "es":
        return `Esa hora ya pasó.`;
      case "fr":
        return `Cette heure est déjà passée.`;
      case "ja":
        return `その時刻はすでに過ぎています。`;
      case "ko":
        return `그 시간은 이미 지났어요.`;
      case "pt-BR":
        return `Esse horário já passou.`;
      case "zh-Hans":
        return `那个时间已经过去了。`;
      case "zh-Hant":
        return `那個時間已經過了。`;
      case "en-XA":
        return `[Ţĥáţ ţîɱé ĥáš áļŕéáðý þáššéð. ~~~~~~~~~~]`;
      case "ar-XB":
        return `‮That time has already passed.‬`;
    }
    return `That time has already passed.`;
  }
  function settingsAutomationPastCard(input) {
    const title = input.title;
    switch (currentLanguage()) {
      case "ar":
        return `بطاقة سابقة: ${title}`;
      case "de":
        return `Frühere Karte: ${title}`;
      case "es":
        return `Tarjeta anterior: ${title}`;
      case "fr":
        return `Ancienne carte : ${title}`;
      case "ja":
        return `過去のカード：${title}`;
      case "ko":
        return `지난 카드: ${title}`;
      case "pt-BR":
        return `Cartão anterior: ${title}`;
      case "zh-Hans":
        return `过去的卡片：${title}`;
      case "zh-Hant":
        return `過去的卡片：${title}`;
      case "en-XA":
        return `[Þášţ çáŕð: ${title} ~~~~]`;
      case "ar-XB":
        return `‮Past card: ‬${title}`;
    }
    return `Past card: ${title}`;
  }
  function settingsAutomationPause() {
    switch (currentLanguage()) {
      case "ar":
        return `إيقاف مؤقت`;
      case "de":
        return `Pausieren`;
      case "es":
        return `Pausar`;
      case "fr":
        return `Mettre en pause`;
      case "ja":
        return `一時停止`;
      case "ko":
        return `일시 정지`;
      case "pt-BR":
        return `Pausar`;
      case "zh-Hans":
        return `暂停`;
      case "zh-Hant":
        return `暫停`;
      case "en-XA":
        return `[Þáûšé ~~]`;
      case "ar-XB":
        return `‮Pause‬`;
    }
    return `Pause`;
  }
  function settingsAutomationPauseAll() {
    switch (currentLanguage()) {
      case "ar":
        return `إيقاف الكل مؤقتًا`;
      case "de":
        return `Alle pausieren`;
      case "es":
        return `Pausar todas`;
      case "fr":
        return `Tout mettre en pause`;
      case "ja":
        return `すべて一時停止`;
      case "ko":
        return `모두 일시 정지`;
      case "pt-BR":
        return `Pausar todas`;
      case "zh-Hans":
        return `全部暂停`;
      case "zh-Hant":
        return `全部暫停`;
      case "en-XA":
        return `[Þáûšé áļļ ~~~]`;
      case "ar-XB":
        return `‮Pause all‬`;
    }
    return `Pause all`;
  }
  function settingsAutomationProject() {
    switch (currentLanguage()) {
      case "ar":
        return `المشروع`;
      case "de":
        return `Projekt`;
      case "es":
        return `Proyecto`;
      case "fr":
        return `Projet`;
      case "ja":
        return `プロジェクト`;
      case "ko":
        return `프로젝트`;
      case "pt-BR":
        return `Projeto`;
      case "zh-Hans":
        return `项目`;
      case "zh-Hant":
        return `專案`;
      case "en-XA":
        return `[Þŕöĵéçţ ~~~]`;
      case "ar-XB":
        return `‮Project‬`;
    }
    return `Project`;
  }
  function settingsAutomationPromptAsSent() {
    switch (currentLanguage()) {
      case "ar":
        return `الرسالة كما أُرسلت`;
      case "de":
        return `Nachricht wie gesendet`;
      case "es":
        return `Indicación tal como se envió`;
      case "fr":
        return `Consigne telle qu’envoyée`;
      case "ja":
        return `送信したプロンプト`;
      case "ko":
        return `보낸 그대로의 메시지`;
      case "pt-BR":
        return `Pedido como foi enviado`;
      case "zh-Hans":
        return `发送时的提示`;
      case "zh-Hant":
        return `送出時的提示`;
      case "en-XA":
        return `[Þŕöɱþţ áš šéñţ ~~~~~]`;
      case "ar-XB":
        return `‮Prompt as sent‬`;
    }
    return `Prompt as sent`;
  }
  function settingsAutomationRemovedProject() {
    switch (currentLanguage()) {
      case "ar":
        return `مشروع أُزيل`;
      case "de":
        return `Ein entferntes Projekt`;
      case "es":
        return `Un proyecto eliminado`;
      case "fr":
        return `Un projet retiré`;
      case "ja":
        return `削除されたプロジェクト`;
      case "ko":
        return `제거된 프로젝트`;
      case "pt-BR":
        return `Um projeto removido`;
      case "zh-Hans":
        return `已移除的项目`;
      case "zh-Hant":
        return `已移除的專案`;
      case "en-XA":
        return `[Å ŕéɱöṽéð þŕöĵéçţ ~~~~~~]`;
      case "ar-XB":
        return `‮A removed project‬`;
    }
    return `A removed project`;
  }
  function settingsAutomationResume() {
    switch (currentLanguage()) {
      case "ar":
        return `استئناف`;
      case "de":
        return `Fortsetzen`;
      case "es":
        return `Reanudar`;
      case "fr":
        return `Reprendre`;
      case "ja":
        return `再開`;
      case "ko":
        return `재개`;
      case "pt-BR":
        return `Retomar`;
      case "zh-Hans":
        return `恢复`;
      case "zh-Hant":
        return `繼續`;
      case "en-XA":
        return `[Ŕéšûɱé ~~]`;
      case "ar-XB":
        return `‮Resume‬`;
    }
    return `Resume`;
  }
  function settingsAutomationReviewSends() {
    switch (currentLanguage()) {
      case "ar":
        return `تذهب هذه الرسالة وتفاصيل جدولها إلى اشتراكك في الذكاء الاصطناعي وتبقى في محادثة نائب القبطان. لا يحصل أي شيء آخر على صلاحية جديدة.`;
      case "de":
        return `Diese Nachricht und ihre Zeitplanangaben gehen an dein KI-Abo und bleiben in der Unterhaltung deines ersten Offiziers. Sonst bekommt nichts neuen Zugriff.`;
      case "es":
        return `Esta indicación y los datos de su programación van a tu suscripción de IA y quedan en la conversación de tu primer oficial. Nada más obtiene acceso nuevo.`;
      case "fr":
        return `Cette consigne et les détails de sa planification sont envoyés à votre abonnement d’IA et restent dans la conversation de votre second. Rien d’autre n’obtient de nouvel accès.`;
      case "ja":
        return `このプロンプトとスケジュールの詳細は AI サブスクリプションに送られ、一等航海士の会話に残ります。ほかに新しくアクセスできるようになるものはありません。`;
      case "ko":
        return `이 메시지와 일정 정보는 AI 구독으로 전달되고 일등항해사의 대화에 남아요. 그 밖에 새로 접근 권한을 얻는 것은 없어요.`;
      case "pt-BR":
        return `Este pedido e os detalhes do agendamento vão para sua assinatura de IA e ficam na conversa do seu imediato. Nada mais ganha novo acesso.`;
      case "zh-Hans":
        return `这条提示及其计划详情会发送到你的 AI 订阅，并保留在大副的对话中。不会有其他内容获得新的访问权限。`;
      case "zh-Hant":
        return `這段提示和它的排程詳細資料會送到你的 AI 訂閱方案，並保留在大副的對話中。其他內容都不會取得新的存取權。`;
      case "en-XA":
        return `[Ţĥîš þŕöɱþţ áñð îţš šçĥéðûļé ðéţáîļš ĝö ţö ýöûŕ ÅÎ šûƀšçŕîþţîöñ áñð šţáý îñ ýöûŕ ƒîŕšţ ɱáţé'š çöñṽéŕšáţîöñ. Ñöţĥîñĝ éļšé ĝéţš ñéŵ áççéšš. ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~]`;
      case "ar-XB":
        return `‮This prompt and its schedule details go to your AI subscription and stay in your first mate's conversation. Nothing else gets new access.‬`;
    }
    return `This prompt and its schedule details go to your AI subscription and stay in your first mate's conversation. Nothing else gets new access.`;
  }
  function settingsAutomationReviewSendsEvents() {
    switch (currentLanguage()) {
      case "ar":
        return `تذهب هذه الرسالة وملخص قصير لكل حدث إلى اشتراكك في الذكاء الاصطناعي وتبقى في محادثة نائب القبطان. لا يحصل أي شيء آخر على صلاحية جديدة.`;
      case "de":
        return `Diese Nachricht und eine kurze Zusammenfassung jedes Ereignisses gehen an dein KI-Abo und bleiben in der Unterhaltung deines ersten Offiziers. Sonst bekommt nichts neuen Zugriff.`;
      case "es":
        return `Esta indicación y un breve resumen de cada evento van a tu suscripción de IA y quedan en la conversación de tu primer oficial. Nada más obtiene acceso nuevo.`;
      case "fr":
        return `Cette consigne et un court résumé de chaque événement sont envoyés à votre abonnement d’IA et restent dans la conversation de votre second. Rien d’autre n’obtient de nouvel accès.`;
      case "ja":
        return `このプロンプトと各イベントの短い要約は AI サブスクリプションに送られ、一等航海士の会話に残ります。ほかに新しくアクセスできるようになるものはありません。`;
      case "ko":
        return `이 메시지와 각 이벤트의 짧은 요약은 AI 구독으로 전달되고 일등항해사의 대화에 남아요. 그 밖에 새로 접근 권한을 얻는 것은 없어요.`;
      case "pt-BR":
        return `Este pedido e um breve resumo de cada evento vão para sua assinatura de IA e ficam na conversa do seu imediato. Nada mais ganha novo acesso.`;
      case "zh-Hans":
        return `这条提示和每个事件的简短摘要会发送到你的 AI 订阅，并保留在大副的对话中。不会有其他内容获得新的访问权限。`;
      case "zh-Hant":
        return `這段提示和每個事件的簡短摘要會送到你的 AI 訂閱方案，並保留在大副的對話中。其他內容都不會取得新的存取權。`;
      case "en-XA":
        return `[Ţĥîš þŕöɱþţ áñð á šĥöŕţ šûɱɱáŕý öƒ éáçĥ éṽéñţ ĝö ţö ýöûŕ ÅÎ šûƀšçŕîþţîöñ áñð šţáý îñ ýöûŕ ƒîŕšţ ɱáţé'š çöñṽéŕšáţîöñ. Ñöţĥîñĝ éļšé ĝéţš ñéŵ áççéšš. ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~]`;
      case "ar-XB":
        return `‮This prompt and a short summary of each event go to your AI subscription and stay in your first mate's conversation. Nothing else gets new access.‬`;
    }
    return `This prompt and a short summary of each event go to your AI subscription and stay in your first mate's conversation. Nothing else gets new access.`;
  }
  function settingsAutomationRunCatchingUp(input) {
    const planned = input.planned;
    const sent = input.sent;
    switch (currentLanguage()) {
      case "ar":
        return `المخطط ${planned}، الإرسال ${sent}، جارٍ التعويض بعد أن كان التطبيق مغلقًا`;
      case "de":
        return `Geplant ${planned}, gesendet ${sent}, nachgeholt, nachdem die App geschlossen war`;
      case "es":
        return `Prevista ${planned}, enviada ${sent}, recuperando tras el cierre de la app`;
      case "fr":
        return `Prévue ${planned}, envoyée ${sent}, rattrapage après la fermeture de l’app`;
      case "ja":
        return `${planned} に予定、${sent} に送信、アプリが閉じていた分を取り戻し中`;
      case "ko":
        return `${planned} 예정, ${sent}에 보냄, 앱이 닫혀 있던 동안의 실행 따라잡는 중`;
      case "pt-BR":
        return `Prevista ${planned}, enviada ${sent}, recuperando depois que o app foi fechado`;
      case "zh-Hans":
        return `计划于 ${planned}，发送于 ${sent}，在应用关闭后补上`;
      case "zh-Hant":
        return `預定於 ${planned}，已於 ${sent} 送出，在程式關閉後補上`;
      case "en-XA":
        return `[Þļáññéð ${planned}, šéñţ ${sent}, çáţçĥîñĝ ûþ áƒţéŕ ţĥé áþþ ŵáš çļöšéð ~~~~~~~~~~~~~~~~~~]`;
      case "ar-XB":
        return `‮Planned ‬${planned}‮, sent ‬${sent}‮, catching up after the app was closed‬`;
    }
    return `Planned ${planned}, sent ${sent}, catching up after the app was closed`;
  }
  function settingsAutomationRunCatchingUpMissed(input) {
    const count = formatNumber(input.count);
    const planned = input.planned;
    const sent = input.sent;
    switch (currentLanguage()) {
      case "ar":
        switch (pluralCategory(input.count)) {
          case "zero":
            return `المخطط ${planned}، الإرسال ${sent}، جارٍ تعويض ${count} عملية تشغيل فائتة`;
          case "one":
            return `المخطط ${planned}، الإرسال ${sent}، جارٍ تعويض ${count} عملية تشغيل فائتة`;
          case "two":
            return `المخطط ${planned}، الإرسال ${sent}، جارٍ تعويض ${count} عمليتي تشغيل فائتتين`;
          case "few":
            return `المخطط ${planned}، الإرسال ${sent}، جارٍ تعويض ${count} عمليات تشغيل فائتة`;
          case "many":
            return `المخطط ${planned}، الإرسال ${sent}، جارٍ تعويض ${count} عمليةَ تشغيل فائتة`;
          default:
            return `المخطط ${planned}، الإرسال ${sent}، جارٍ تعويض ${count} عملية تشغيل فائتة`;
        }
      case "de":
        switch (pluralCategory(input.count)) {
          case "one":
            return `Geplant ${planned}, gesendet ${sent}, holt ${count} verpassten Lauf nach`;
          default:
            return `Geplant ${planned}, gesendet ${sent}, holt ${count} verpasste Läufe nach`;
        }
      case "es":
        switch (pluralCategory(input.count)) {
          case "one":
            return `Prevista ${planned}, enviada ${sent}, recuperando ${count} ejecución perdida`;
          case "many":
            return `Prevista ${planned}, enviada ${sent}, recuperando ${count} de ejecuciones perdidas`;
          default:
            return `Prevista ${planned}, enviada ${sent}, recuperando ${count} ejecuciones perdidas`;
        }
      case "fr":
        switch (pluralCategory(input.count)) {
          case "one":
            return `Prévue ${planned}, envoyée ${sent}, rattrapage de ${count} exécution manquée`;
          case "many":
            return `Prévue ${planned}, envoyée ${sent}, rattrapage de ${count} exécutions manquées`;
          default:
            return `Prévue ${planned}, envoyée ${sent}, rattrapage de ${count} exécutions manquées`;
        }
      case "ja":
        switch (pluralCategory(input.count)) {
          default:
            return `${planned} に予定、${sent} に送信、逃した${count}回の実行を取り戻し中`;
        }
      case "ko":
        switch (pluralCategory(input.count)) {
          default:
            return `${planned} 예정, ${sent}에 보냄, 놓친 실행 ${count}번 따라잡는 중`;
        }
      case "pt-BR":
        switch (pluralCategory(input.count)) {
          case "one":
            return `Prevista ${planned}, enviada ${sent}, recuperando ${count} execução perdida`;
          case "many":
            return `Prevista ${planned}, enviada ${sent}, recuperando ${count} execuções perdidas`;
          default:
            return `Prevista ${planned}, enviada ${sent}, recuperando ${count} execuções perdidas`;
        }
      case "zh-Hans":
        switch (pluralCategory(input.count)) {
          default:
            return `计划于 ${planned}，发送于 ${sent}，补上 ${count} 次错过的运行`;
        }
      case "zh-Hant":
        switch (pluralCategory(input.count)) {
          default:
            return `預定於 ${planned}，已於 ${sent} 送出，補上錯過的 ${count} 次執行`;
        }
      case "en-XA":
        switch (pluralCategory(input.count, "en")) {
          case "one":
            return `[Þļáññéð ${planned}, šéñţ ${sent}, çáţçĥîñĝ ûþ ${count} ɱîššéð ŕûñ ~~~~~~~~~~~~~~]`;
          default:
            return `[Þļáññéð ${planned}, šéñţ ${sent}, çáţçĥîñĝ ûþ ${count} ɱîššéð ŕûñš ~~~~~~~~~~~~~~]`;
        }
      case "ar-XB":
        switch (pluralCategory(input.count, "en")) {
          case "one":
            return `‮Planned ‬${planned}‮, sent ‬${sent}‮, catching up ‬${count}‮ missed run‬`;
          default:
            return `‮Planned ‬${planned}‮, sent ‬${sent}‮, catching up ‬${count}‮ missed runs‬`;
        }
    }
    switch (pluralCategory(input.count)) {
      case "one":
        return `Planned ${planned}, sent ${sent}, catching up ${count} missed run`;
      default:
        return `Planned ${planned}, sent ${sent}, catching up ${count} missed runs`;
    }
  }
  function settingsAutomationRunEvents(input) {
    const count = formatNumber(input.count);
    const sent = input.sent;
    switch (currentLanguage()) {
      case "ar":
        switch (pluralCategory(input.count)) {
          case "zero":
            return `${count} حدث، الإرسال ${sent}`;
          case "one":
            return `${count} حدث، الإرسال ${sent}`;
          case "two":
            return `${count} حدثان، الإرسال ${sent}`;
          case "few":
            return `${count} أحداث، الإرسال ${sent}`;
          case "many":
            return `${count} حدثًا، الإرسال ${sent}`;
          default:
            return `${count} حدث، الإرسال ${sent}`;
        }
      case "de":
        switch (pluralCategory(input.count)) {
          case "one":
            return `${count} Ereignis, gesendet ${sent}`;
          default:
            return `${count} Ereignisse, gesendet ${sent}`;
        }
      case "es":
        switch (pluralCategory(input.count)) {
          case "one":
            return `${count} evento, enviado ${sent}`;
          case "many":
            return `${count} de eventos, enviados ${sent}`;
          default:
            return `${count} eventos, enviados ${sent}`;
        }
      case "fr":
        switch (pluralCategory(input.count)) {
          case "one":
            return `${count} événement, envoyé ${sent}`;
          case "many":
            return `${count} événements, envoyés ${sent}`;
          default:
            return `${count} événements, envoyés ${sent}`;
        }
      case "ja":
        switch (pluralCategory(input.count)) {
          default:
            return `${count}件のイベント、${sent} に送信`;
        }
      case "ko":
        switch (pluralCategory(input.count)) {
          default:
            return `이벤트 ${count}개, ${sent}에 보냄`;
        }
      case "pt-BR":
        switch (pluralCategory(input.count)) {
          case "one":
            return `${count} evento, enviado ${sent}`;
          case "many":
            return `${count} eventos, enviados ${sent}`;
          default:
            return `${count} eventos, enviados ${sent}`;
        }
      case "zh-Hans":
        switch (pluralCategory(input.count)) {
          default:
            return `${count} 个事件，发送于 ${sent}`;
        }
      case "zh-Hant":
        switch (pluralCategory(input.count)) {
          default:
            return `${count} 個事件，已於 ${sent} 送出`;
        }
      case "en-XA":
        switch (pluralCategory(input.count, "en")) {
          case "one":
            return `[${count} éṽéñţ, šéñţ ${sent} ~~~~~]`;
          default:
            return `[${count} éṽéñţš, šéñţ ${sent} ~~~~~]`;
        }
      case "ar-XB":
        switch (pluralCategory(input.count, "en")) {
          case "one":
            return `${count}‮ event, sent ‬${sent}`;
          default:
            return `${count}‮ events, sent ‬${sent}`;
        }
    }
    switch (pluralCategory(input.count)) {
      case "one":
        return `${count} event, sent ${sent}`;
      default:
        return `${count} events, sent ${sent}`;
    }
  }
  function settingsAutomationRunPlanned(input) {
    const planned = input.planned;
    const sent = input.sent;
    switch (currentLanguage()) {
      case "ar":
        return `المخطط ${planned}، الإرسال ${sent}`;
      case "de":
        return `Geplant ${planned}, gesendet ${sent}`;
      case "es":
        return `Prevista ${planned}, enviada ${sent}`;
      case "fr":
        return `Prévue ${planned}, envoyée ${sent}`;
      case "ja":
        return `${planned} に予定、${sent} に送信`;
      case "ko":
        return `${planned} 예정, ${sent}에 보냄`;
      case "pt-BR":
        return `Prevista ${planned}, enviada ${sent}`;
      case "zh-Hans":
        return `计划于 ${planned}，发送于 ${sent}`;
      case "zh-Hant":
        return `預定於 ${planned}，已於 ${sent} 送出`;
      case "en-XA":
        return `[Þļáññéð ${planned}, šéñţ ${sent} ~~~~~]`;
      case "ar-XB":
        return `‮Planned ‬${planned}‮, sent ‬${sent}`;
    }
    return `Planned ${planned}, sent ${sent}`;
  }
  function settingsAutomationRuns() {
    switch (currentLanguage()) {
      case "ar":
        return `التشغيل`;
      case "de":
        return `Läuft`;
      case "es":
        return `Ejecuciones`;
      case "fr":
        return `Exécutions`;
      case "ja":
        return `実行`;
      case "ko":
        return `실행`;
      case "pt-BR":
        return `Execuções`;
      case "zh-Hans":
        return `运行`;
      case "zh-Hant":
        return `執行`;
      case "en-XA":
        return `[Ŕûñš ~~]`;
      case "ar-XB":
        return `‮Runs‬`;
    }
    return `Runs`;
  }
  function settingsAutomationRunsEachTime() {
    switch (currentLanguage()) {
      case "ar":
        return `في كل مرة تصل فيها أحداث جديدة.`;
      case "de":
        return `Jedes Mal, wenn neue Ereignisse eintreffen.`;
      case "es":
        return `Cada vez que llegan eventos nuevos.`;
      case "fr":
        return `Chaque fois que de nouveaux événements arrivent.`;
      case "ja":
        return `新しいイベントが届くたびに実行します。`;
      case "ko":
        return `새 이벤트가 올 때마다.`;
      case "pt-BR":
        return `Sempre que chegam novos eventos.`;
      case "zh-Hans":
        return `每次有新事件到达时。`;
      case "zh-Hant":
        return `每次有新事件到達時。`;
      case "en-XA":
        return `[Éáçĥ ţîɱé ñéŵ éṽéñţš áŕŕîṽé. ~~~~~~~~~~]`;
      case "ar-XB":
        return `‮Each time new events arrive.‬`;
    }
    return `Each time new events arrive.`;
  }
  function settingsAutomationRunsEachTimeLooks(input) {
    const count = formatNumber(input.count);
    switch (currentLanguage()) {
      case "ar":
        switch (pluralCategory(input.count)) {
          case "zero":
            return `في كل مرة تصل فيها أحداث جديدة. يتحقق Infinitary كل ${count} دقيقة.`;
          case "one":
            return `في كل مرة تصل فيها أحداث جديدة. يتحقق Infinitary كل دقيقة.`;
          case "two":
            return `في كل مرة تصل فيها أحداث جديدة. يتحقق Infinitary كل ${count} دقيقتين.`;
          case "few":
            return `في كل مرة تصل فيها أحداث جديدة. يتحقق Infinitary كل ${count} دقائق.`;
          case "many":
            return `في كل مرة تصل فيها أحداث جديدة. يتحقق Infinitary كل ${count} دقيقة.`;
          default:
            return `في كل مرة تصل فيها أحداث جديدة. يتحقق Infinitary كل ${count} دقيقة.`;
        }
      case "de":
        switch (pluralCategory(input.count)) {
          case "one":
            return `Jedes Mal, wenn neue Ereignisse eintreffen. Infinitary schaut jede Minute nach.`;
          default:
            return `Jedes Mal, wenn neue Ereignisse eintreffen. Infinitary schaut alle ${count} Minuten nach.`;
        }
      case "es":
        switch (pluralCategory(input.count)) {
          case "one":
            return `Cada vez que llegan eventos nuevos. Infinitary revisa cada minuto.`;
          case "many":
            return `Cada vez que llegan eventos nuevos. Infinitary revisa cada ${count} de minutos.`;
          default:
            return `Cada vez que llegan eventos nuevos. Infinitary revisa cada ${count} minutos.`;
        }
      case "fr":
        switch (pluralCategory(input.count)) {
          case "one":
            return `Chaque fois que de nouveaux événements arrivent. Infinitary vérifie chaque minute.`;
          case "many":
            return `Chaque fois que de nouveaux événements arrivent. Infinitary vérifie toutes les ${count} minutes.`;
          default:
            return `Chaque fois que de nouveaux événements arrivent. Infinitary vérifie toutes les ${count} minutes.`;
        }
      case "ja":
        switch (pluralCategory(input.count)) {
          default:
            return `新しいイベントが届くたびに実行します。Infinitary は${count}分ごとに確認します。`;
        }
      case "ko":
        switch (pluralCategory(input.count)) {
          default:
            return `새 이벤트가 올 때마다. Infinitary는 ${count}분마다 확인해요.`;
        }
      case "pt-BR":
        switch (pluralCategory(input.count)) {
          case "one":
            return `Sempre que chegam novos eventos. O Infinitary verifica a cada minuto.`;
          case "many":
            return `Sempre que chegam novos eventos. O Infinitary verifica a cada ${count} minutos.`;
          default:
            return `Sempre que chegam novos eventos. O Infinitary verifica a cada ${count} minutos.`;
        }
      case "zh-Hans":
        switch (pluralCategory(input.count)) {
          default:
            return `每次有新事件到达时。Infinitary 每 ${count} 分钟查看一次。`;
        }
      case "zh-Hant":
        switch (pluralCategory(input.count)) {
          default:
            return `每次有新事件到達時。Infinitary 每 ${count} 分鐘查看一次。`;
        }
      case "en-XA":
        switch (pluralCategory(input.count, "en")) {
          case "one":
            return `[Éáçĥ ţîɱé ñéŵ éṽéñţš áŕŕîṽé. Îñƒîñîţáŕý ļööķš éṽéŕý ɱîñûţé. ~~~~~~~~~~~~~~~~~~~~]`;
          default:
            return `[Éáçĥ ţîɱé ñéŵ éṽéñţš áŕŕîṽé. Îñƒîñîţáŕý ļööķš éṽéŕý ${count} ɱîñûţéš. ~~~~~~~~~~~~~~~~~~~~~]`;
        }
      case "ar-XB":
        switch (pluralCategory(input.count, "en")) {
          case "one":
            return `‮Each time new events arrive. Infinitary looks every minute.‬`;
          default:
            return `‮Each time new events arrive. Infinitary looks every ‬${count}‮ minutes.‬`;
        }
    }
    switch (pluralCategory(input.count)) {
      case "one":
        return `Each time new events arrive. Infinitary looks every minute.`;
      default:
        return `Each time new events arrive. Infinitary looks every ${count} minutes.`;
    }
  }
  function settingsAutomationStoppedWhen() {
    switch (currentLanguage()) {
      case "ar":
        return `في انتظار اختيار التكامل الخاص بها من جديد`;
      case "de":
        return `Wartet darauf, dass ihre Integration wieder gewählt wird`;
      case "es":
        return `Esperando a que vuelvas a elegir su integración`;
      case "fr":
        return `En attente d’un nouveau choix de son intégration`;
      case "ja":
        return `連携がもう一度選ばれるのを待っています`;
      case "ko":
        return `연동이 다시 선택되기를 기다리는 중`;
      case "pt-BR":
        return `Aguardando a integração ser escolhida de novo`;
      case "zh-Hans":
        return `正在等待重新选择它的集成`;
      case "zh-Hant":
        return `正在等待重新選擇它的整合`;
      case "en-XA":
        return `[Ŵáîţîñĝ ƒöŕ îţš îñţéĝŕáţîöñ ţö ƀé þîçķéð áĝáîñ ~~~~~~~~~~~~~~~~]`;
      case "ar-XB":
        return `‮Waiting for its integration to be picked again‬`;
    }
    return `Waiting for its integration to be picked again`;
  }
  function settingsAutomationTimeZone() {
    switch (currentLanguage()) {
      case "ar":
        return `المنطقة الزمنية`;
      case "de":
        return `Zeitzone`;
      case "es":
        return `Zona horaria`;
      case "fr":
        return `Fuseau horaire`;
      case "ja":
        return `タイムゾーン`;
      case "ko":
        return `시간대`;
      case "pt-BR":
        return `Fuso horário`;
      case "zh-Hans":
        return `时区`;
      case "zh-Hant":
        return `時區`;
      case "en-XA":
        return `[Ţîɱé žöñé ~~~]`;
      case "ar-XB":
        return `‮Time zone‬`;
    }
    return `Time zone`;
  }
  function settingsAutomationTurnOn() {
    switch (currentLanguage()) {
      case "ar":
        return `تشغيل`;
      case "de":
        return `Einschalten`;
      case "es":
        return `Activar`;
      case "fr":
        return `Activer`;
      case "ja":
        return `オンにする`;
      case "ko":
        return `켜기`;
      case "pt-BR":
        return `Ativar`;
      case "zh-Hans":
        return `打开`;
      case "zh-Hant":
        return `開啟`;
      case "en-XA":
        return `[Ţûŕñ öñ ~~~]`;
      case "ar-XB":
        return `‮Turn on‬`;
    }
    return `Turn on`;
  }
  function settingsAutomationTurnOnQuestion() {
    switch (currentLanguage()) {
      case "ar":
        return `تشغيل هذه الأتمتة؟`;
      case "de":
        return `Diese Automatisierung einschalten?`;
      case "es":
        return `¿Activar esta automatización?`;
      case "fr":
        return `Activer cette automatisation ?`;
      case "ja":
        return `この自動化をオンにしますか？`;
      case "ko":
        return `이 자동화를 켤까요?`;
      case "pt-BR":
        return `Ativar esta automação?`;
      case "zh-Hans":
        return `打开这项自动化？`;
      case "zh-Hant":
        return `要開啟這項自動化嗎？`;
      case "en-XA":
        return `[Ţûŕñ öñ ţĥîš áûţöɱáţîöñ? ~~~~~~~~]`;
      case "ar-XB":
        return `‮Turn on this automation?‬`;
    }
    return `Turn on this automation?`;
  }
  function settingsAutomationVersion(input) {
    const version2 = input.version;
    switch (currentLanguage()) {
      case "ar":
        return `النسخة ${version2}`;
      case "de":
        return `Version ${version2}`;
      case "es":
        return `versión ${version2}`;
      case "fr":
        return `version ${version2}`;
      case "ja":
        return `バージョン ${version2}`;
      case "ko":
        return `버전 ${version2}`;
      case "pt-BR":
        return `versão ${version2}`;
      case "zh-Hans":
        return `版本 ${version2}`;
      case "zh-Hant":
        return `版本 ${version2}`;
      case "en-XA":
        return `[ṽéŕšîöñ ${version2} ~~~]`;
      case "ar-XB":
        return `‮version ‬${version2}`;
    }
    return `version ${version2}`;
  }
  function settingsAutomationWhatItSends() {
    switch (currentLanguage()) {
      case "ar":
        return `ما ترسله`;
      case "de":
        return `Was sie sendet`;
      case "es":
        return `Lo que envía`;
      case "fr":
        return `Ce qu’elle envoie`;
      case "ja":
        return `送信する内容`;
      case "ko":
        return `보내는 것`;
      case "pt-BR":
        return `O que ela envia`;
      case "zh-Hans":
        return `发送的内容`;
      case "zh-Hant":
        return `送出的內容`;
      case "en-XA":
        return `[Ŵĥáţ îţ šéñðš ~~~~~]`;
      case "ar-XB":
        return `‮What it sends‬`;
    }
    return `What it sends`;
  }
  function settingsAutomationWhen() {
    switch (currentLanguage()) {
      case "ar":
        return `متى`;
      case "de":
        return `Wann`;
      case "es":
        return `Cuándo`;
      case "fr":
        return `Quand`;
      case "ja":
        return `タイミング`;
      case "ko":
        return `언제`;
      case "pt-BR":
        return `Quando`;
      case "zh-Hans":
        return `时间`;
      case "zh-Hant":
        return `時間`;
      case "en-XA":
        return `[Ŵĥéñ ~~]`;
      case "ar-XB":
        return `‮When‬`;
    }
    return `When`;
  }
  function settingsAutomationZoneNote() {
    switch (currentLanguage()) {
      case "ar":
        return `تعمل في هذا الوقت حسب المنطقة الزمنية التي تختارها، أينما كان هذا الحاسوب. تعمل الأتمتة فقط ما دام Infinitary مفتوحًا والحاسوب مستيقظًا؛ وأي تشغيل يفوت في أثناء ذلك يُنفَّذ مرة واحدة عند عودته.`;
      case "de":
        return `Läuft zu dieser Uhrzeit in der gewählten Zeitzone, wo auch immer dieser Computer ist. Die Automatisierung läuft nur, solange Infinitary geöffnet und der Computer wach ist; ein in der Zwischenzeit verpasster Lauf wird einmal nachgeholt, sobald er zurück ist.`;
      case "es":
        return `Se ejecuta a esta hora en la zona que elijas, esté donde esté esta computadora. La automatización se ejecuta solo mientras Infinitary está abierto y la computadora está activa; una ejecución perdida mientras tanto se hace una sola vez cuando vuelve.`;
      case "fr":
        return `S’exécute à cette heure dans le fuseau que vous choisissez, où que se trouve cet ordinateur. L’automatisation s’exécute seulement quand Infinitary est ouvert et que l’ordinateur est éveillé ; une exécution manquée entre-temps a lieu une seule fois à son retour.`;
      case "ja":
        return `このコンピューターがどこにあっても、選んだタイムゾーンのこの時刻に実行します。自動化は Infinitary が開いていてコンピューターがスリープしていない間だけ実行されます。その間に逃した実行は、復帰時に1回行われます。`;
      case "ko":
        return `이 컴퓨터가 어디에 있든 고른 시간대의 이 시각에 실행돼요. 자동화는 Infinitary가 열려 있고 컴퓨터가 깨어 있을 때만 실행돼요. 그동안 놓친 실행은 돌아왔을 때 한 번 실행해요.`;
      case "pt-BR":
        return `Roda neste horário no fuso que você escolher, onde quer que este computador esteja. A automação só roda enquanto o Infinitary estiver aberto e o computador estiver ativo; uma execução perdida nesse meio-tempo acontece uma vez quando ele voltar.`;
      case "zh-Hans":
        return `按你选择的时区在这个时间运行，无论这台电脑身在何处。自动化仅在 Infinitary 打开且电脑未睡眠时运行；期间错过的运行会在它恢复后运行一次。`;
      case "zh-Hant":
        return `依你選擇的時區在這個時間執行，不論這台電腦在哪裡。自動化只在 Infinitary 開啟且電腦未睡眠時執行；期間錯過的執行會在它恢復後執行一次。`;
      case "en-XA":
        return `[Ŕûñš áţ ţĥîš ţîɱé îñ ţĥé žöñé ýöû þîçķ, ŵĥéŕéṽéŕ ţĥîš çöɱþûţéŕ îš. Åûţöɱáţîöñ ŕûñš öñļý ŵĥîļé Îñƒîñîţáŕý îš öþéñ áñð ţĥé çöɱþûţéŕ îš áŵáķé; á ŕûñ ɱîššéð ɱéáñŵĥîļé ĥáþþéñš öñçé ŵĥéñ îţ ŕéţûŕñš. ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~]`;
      case "ar-XB":
        return `‮Runs at this time in the zone you pick, wherever this computer is. Automation runs only while Infinitary is open and the computer is awake; a run missed meanwhile happens once when it returns.‬`;
    }
    return `Runs at this time in the zone you pick, wherever this computer is. Automation runs only while Infinitary is open and the computer is awake; a run missed meanwhile happens once when it returns.`;
  }
  function settingsAutomationZoneNoteThere(input) {
    const where = input.where;
    switch (currentLanguage()) {
      case "ar":
        return `تعمل في هذا الوقت حسب المنطقة الزمنية التي تختارها. تعمل الأتمتة على ${where}، فقط ما دام Infinitary مفتوحًا هناك والحاسوب مستيقظًا؛ وأي تشغيل يفوت في أثناء ذلك يُنفَّذ مرة واحدة عند عودته.`;
      case "de":
        return `Läuft zu dieser Uhrzeit in der gewählten Zeitzone. Die Automatisierung läuft auf ${where}, nur solange Infinitary dort geöffnet und der Computer wach ist; ein in der Zwischenzeit verpasster Lauf wird einmal nachgeholt, sobald er zurück ist.`;
      case "es":
        return `Se ejecuta a esta hora en la zona que elijas. La automatización se ejecuta en ${where}, solo mientras Infinitary está abierto allí y la computadora está activa; una ejecución perdida mientras tanto se hace una sola vez cuando vuelve.`;
      case "fr":
        return `S’exécute à cette heure dans le fuseau que vous choisissez. L’automatisation s’exécute sur ${where}, seulement quand Infinitary y est ouvert et que l’ordinateur est éveillé ; une exécution manquée entre-temps a lieu une seule fois à son retour.`;
      case "ja":
        return `選んだタイムゾーンのこの時刻に実行します。自動化は ${where} で、そこで Infinitary が開いていてスリープしていない間だけ実行されます。その間に逃した実行は、復帰時に1回行われます。`;
      case "ko":
        return `고른 시간대의 이 시각에 실행돼요. 자동화는 ${where}에서 실행되며, 그곳에서 Infinitary가 열려 있고 컴퓨터가 깨어 있을 때만 실행돼요. 그동안 놓친 실행은 돌아왔을 때 한 번 실행해요.`;
      case "pt-BR":
        return `Roda neste horário no fuso que você escolher. A automação roda em ${where}, só enquanto o Infinitary estiver aberto lá e o computador estiver ativo; uma execução perdida nesse meio-tempo acontece uma vez quando ele voltar.`;
      case "zh-Hans":
        return `按你选择的时区在这个时间运行。自动化在 ${where} 上运行，仅在那里的 Infinitary 打开且电脑未睡眠时运行；期间错过的运行会在它恢复后运行一次。`;
      case "zh-Hant":
        return `依你選擇的時區在這個時間執行。自動化在 ${where} 上執行，只在那裡的 Infinitary 開啟且電腦未睡眠時執行；期間錯過的執行會在它恢復後執行一次。`;
      case "en-XA":
        return `[Ŕûñš áţ ţĥîš ţîɱé îñ ţĥé žöñé ýöû þîçķ. Åûţöɱáţîöñ ŕûñš öñ ${where}, öñļý ŵĥîļé Îñƒîñîţáŕý îš öþéñ ţĥéŕé áñð îţ îš áŵáķé; á ŕûñ ɱîššéð ɱéáñŵĥîļé ĥáþþéñš öñçé ŵĥéñ îţ ŕéţûŕñš. ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~]`;
      case "ar-XB":
        return `‮Runs at this time in the zone you pick. Automation runs on ‬${where}‮, only while Infinitary is open there and it is awake; a run missed meanwhile happens once when it returns.‬`;
    }
    return `Runs at this time in the zone you pick. Automation runs on ${where}, only while Infinitary is open there and it is awake; a run missed meanwhile happens once when it returns.`;
  }
  function settingsDevicesSignInsAsOf(input) {
    const time2 = input.time;
    switch (currentLanguage()) {
      case "ar":
        return `حتى الساعة ${time2}`;
      case "de":
        return `Stand ${time2}`;
      case "es":
        return `a las ${time2}`;
      case "fr":
        return `à ${time2}`;
      case "ja":
        return `${time2} 時点`;
      case "ko":
        return `${time2} 기준`;
      case "pt-BR":
        return `às ${time2}`;
      case "zh-Hans":
        return `截至 ${time2}`;
      case "zh-Hant":
        return `截至 ${time2}`;
      case "en-XA":
        return `[áš öƒ ${time2} ~~]`;
      case "ar-XB":
        return `‮as of ‬${time2}`;
    }
    return `as of ${time2}`;
  }
  function settingsDevicesSignInsNone() {
    switch (currentLanguage()) {
      case "ar":
        return `لا تسجيلات دخول بعد.`;
      case "de":
        return `Noch keine Anmeldungen.`;
      case "es":
        return `Todavía sin inicios de sesión.`;
      case "fr":
        return `Aucune connexion pour l’instant.`;
      case "ja":
        return `サインインはまだありません。`;
      case "ko":
        return `아직 로그인이 없어요.`;
      case "pt-BR":
        return `Nenhum login ainda.`;
      case "zh-Hans":
        return `尚无登录。`;
      case "zh-Hant":
        return `還沒有登入。`;
      case "en-XA":
        return `[Ñö šîĝñ-îñš ýéţ. ~~~~~~]`;
      case "ar-XB":
        return `‮No sign-ins yet.‬`;
    }
    return `No sign-ins yet.`;
  }
  function settingsDevicesSignInsOwn(input) {
    const where = input.where;
    switch (currentLanguage()) {
      case "ar":
        return `تسجيلات الدخول الخاصة به. المهمة التي تعمل ${where} تستخدم هذه فقط.`;
      case "de":
        return `Seine eigenen Anmeldungen. Eine Aufgabe, die ${where} läuft, nutzt nur diese.`;
      case "es":
        return `Sus propios inicios de sesión. Una tarea que se ejecuta ${where} solo usa estos.`;
      case "fr":
        return `Ses propres connexions. Une tâche qui s’exécute ${where} n’utilise que celles-ci.`;
      case "ja":
        return `専用のサインインです。タスクを${where}実行するときは、これだけを使います。`;
      case "ko":
        return `전용 로그인이에요. ${where} 실행되는 작업은 이 로그인만 써요.`;
      case "pt-BR":
        return `Os logins próprios dele. Uma tarefa que roda ${where} usa só estes.`;
      case "zh-Hans":
        return `它自己的登录。${where}运行的任务只使用这些登录。`;
      case "zh-Hant":
        return `它自己的登入。${where}執行的任務只會使用這些登入。`;
      case "en-XA":
        return `[Îţš öŵñ šîĝñ-îñš. Å ţášķ ţĥáţ ŕûñš ${where} ûšéš öñļý ţĥéšé. ~~~~~~~~~~~~~~~~~~]`;
      case "ar-XB":
        return `‮Its own sign-ins. A task that runs ‬${where}‮ uses only these.‬`;
    }
    return `Its own sign-ins. A task that runs ${where} uses only these.`;
  }
  function settingsDevicesSignInsUnanswered(input) {
    const home = input.home;
    const who = input.who;
    switch (currentLanguage()) {
      case "ar":
        return `لم يذكر ${who} ما هو مسجّل الدخول إليه. قد يحتاج إلى نسخة Infinitary الموجودة على ${home}.`;
      case "de":
        return `${who} hat nicht gesagt, wobei er angemeldet ist. Er braucht vielleicht die Infinitary-Version von ${home}.`;
      case "es":
        return `${who} no dijo en qué tiene la sesión iniciada. Puede que necesite la versión de Infinitary de ${home}.`;
      case "fr":
        return `${who} n’a pas indiqué à quoi il est connecté. Il lui faut peut-être la version d’Infinitary de ${home}.`;
      case "ja":
        return `${who} から、サインイン先の応答がありませんでした。${home} と同じバージョンの Infinitary が必要な可能性があります。`;
      case "ko":
        return `${who}이(가) 어디에 로그인되어 있는지 알려 주지 않았어요. ${home}의 Infinitary 버전이 필요할 수 있어요.`;
      case "pt-BR":
        return `${who} não disse em que está com login. Talvez precise da versão do Infinitary de ${home}.`;
      case "zh-Hans":
        return `${who} 没有说明它登录了什么。它可能需要与 ${home} 相同版本的 Infinitary。`;
      case "zh-Hant":
        return `${who} 沒有說明它登入了什麼。它可能需要和 ${home} 相同版本的 Infinitary。`;
      case "en-XA":
        return `[${who} ðîð ñöţ šáý ŵĥáţ îţ îš šîĝñéð îñ ţö. Îţ ɱáý ñééð ${home}'š ṽéŕšîöñ öƒ Îñƒîñîţáŕý. ~~~~~~~~~~~~~~~~~~~~~~~~~]`;
      case "ar-XB":
        return `${who}‮ did not say what it is signed in to. It may need ‬${home}‮'s version of Infinitary.‬`;
    }
    return `${who} did not say what it is signed in to. It may need ${home}'s version of Infinitary.`;
  }
  function settingsGeneralCustomApi() {
    switch (currentLanguage()) {
      case "ar":
        return `واجهة API مخصصة`;
      case "de":
        return `Eigene API`;
      case "es":
        return `API personalizada`;
      case "fr":
        return `API personnalisée`;
      case "ja":
        return `カスタム API`;
      case "ko":
        return `사용자 지정 API`;
      case "pt-BR":
        return `API personalizada`;
      case "zh-Hans":
        return `自定义 API`;
      case "zh-Hant":
        return `自訂 API`;
      case "en-XA":
        return `[Çûšţöɱ ÅÞÎ ~~~~]`;
      case "ar-XB":
        return `‮Custom API‬`;
    }
    return `Custom API`;
  }
  function settingsPhoneAccountsThere(input) {
    const home = input.home;
    switch (currentLanguage()) {
      case "ar":
        return `تبقى عمليات تسجيل الدخول على ${home}. أضف حسابًا أو أوقفه مؤقتًا أو أزله هناك.`;
      case "de":
        return `Anmeldungen bleiben auf ${home}. Dort kannst du ein Konto hinzufügen, pausieren oder entfernen.`;
      case "es":
        return `Los inicios de sesión se quedan en ${home}. Agrega, pausa o quita una cuenta allí.`;
      case "fr":
        return `Les connexions restent sur ${home}. C’est là que vous ajoutez, mettez en pause ou retirez un compte.`;
      case "ja":
        return `サインインは ${home} に保管されます。アカウントの追加、一時停止、削除はそちらで行ってください。`;
      case "ko":
        return `로그인은 ${home}에 보관돼요. 계정 추가, 일시 정지, 제거는 그곳에서 하세요.`;
      case "pt-BR":
        return `Os logins ficam em ${home}. Adicione, pause ou remova uma conta lá.`;
      case "zh-Hans":
        return `登录保留在 ${home} 上。请在那里添加、暂停或移除账户。`;
      case "zh-Hant":
        return `登入保存在 ${home} 上。請在那裡加入、暫停或移除帳號。`;
      case "en-XA":
        return `[Šîĝñ-îñš šţáý öñ ${home}. Åðð, þáûšé öŕ ŕéɱöṽé áñ áççöûñţ ţĥéŕé. ~~~~~~~~~~~~~~~~~~~]`;
      case "ar-XB":
        return `‮Sign-ins stay on ‬${home}‮. Add, pause or remove an account there.‬`;
    }
    return `Sign-ins stay on ${home}. Add, pause or remove an account there.`;
  }
  function settingsPhoneAutomationLead() {
    switch (currentLanguage()) {
      case "ar":
        return `رسائل يتلقاها نائب القبطان وفق جدول.`;
      case "de":
        return `Nachrichten, die dein erster Offizier nach Zeitplan bekommt.`;
      case "es":
        return `Indicaciones que tu primer oficial recibe según una programación.`;
      case "fr":
        return `Des consignes que votre second reçoit selon une planification.`;
      case "ja":
        return `スケジュールに沿って一等航海士に届くプロンプトです。`;
      case "ko":
        return `일정에 따라 일등항해사가 받는 메시지예요.`;
      case "pt-BR":
        return `Pedidos que seu imediato recebe em horários agendados.`;
      case "zh-Hans":
        return `按计划发给你的大副的提示。`;
      case "zh-Hant":
        return `依排程傳給你的大副的提示。`;
      case "en-XA":
        return `[Þŕöɱþţš ýöûŕ ƒîŕšţ ɱáţé ĝéţš öñ á šçĥéðûļé. ~~~~~~~~~~~~~~~]`;
      case "ar-XB":
        return `‮Prompts your first mate gets on a schedule.‬`;
    }
    return `Prompts your first mate gets on a schedule.`;
  }
  function settingsPhoneAutomationsThere(input) {
    const home = input.home;
    switch (currentLanguage()) {
      case "ar":
        return `لإنشاء أتمتة أو تغييرها أو حذفها، افتح الإعدادات ← الأتمتة على ${home}.`;
      case "de":
        return `Um eine Automatisierung zu erstellen, zu ändern oder zu löschen, öffne Einstellungen → Automatisierung auf ${home}.`;
      case "es":
        return `Para crear, cambiar o eliminar una automatización, abre Configuración → Automatización en ${home}.`;
      case "fr":
        return `Pour créer, modifier ou supprimer une automatisation, ouvrez Réglages → Automatisation sur ${home}.`;
      case "ja":
        return `自動化を作成、変更、削除するには、${home} で「設定 → 自動化」を開いてください。`;
      case "ko":
        return `자동화를 만들거나 바꾸거나 삭제하려면 ${home}에서 설정 → 자동화를 여세요.`;
      case "pt-BR":
        return `Para criar, alterar ou apagar uma automação, abra Ajustes → Automação em ${home}.`;
      case "zh-Hans":
        return `要创建、更改或删除自动化，请在 ${home} 上打开“设置” → “自动化”。`;
      case "zh-Hant":
        return `若要建立、變更或刪除自動化，請在 ${home} 上開啟「設定 → 自動化」。`;
      case "en-XA":
        return `[Ţö ɱáķé, çĥáñĝé öŕ ðéļéţé áñ áûţöɱáţîöñ, öþéñ Šéţţîñĝš → Åûţöɱáţîöñ öñ ${home}. ~~~~~~~~~~~~~~~~~~~~~~~~]`;
      case "ar-XB":
        return `‮To make, change or delete an automation, open Settings → Automation on ‬${home}‮.‬`;
    }
    return `To make, change or delete an automation, open Settings → Automation on ${home}.`;
  }
  function settingsPhoneByFirstMate() {
    switch (currentLanguage()) {
      case "ar":
        return `من إعداد نائب القبطان`;
      case "de":
        return `Von deinem ersten Offizier eingerichtet`;
      case "es":
        return `La configuró tu primer oficial`;
      case "fr":
        return `Configurée par votre second`;
      case "ja":
        return `一等航海士が設定`;
      case "ko":
        return `일등항해사가 설정함`;
      case "pt-BR":
        return `Configurada pelo seu imediato`;
      case "zh-Hans":
        return `由你的大副设置`;
      case "zh-Hant":
        return `由你的大副設定`;
      case "en-XA":
        return `[Šéţ ûþ ƀý ýöûŕ ƒîŕšţ ɱáţé ~~~~~~~~~]`;
      case "ar-XB":
        return `‮Set up by your first mate‬`;
    }
    return `Set up by your first mate`;
  }
  function settingsPhoneLastRan() {
    switch (currentLanguage()) {
      case "ar":
        return `آخر تشغيل`;
      case "de":
        return `Zuletzt gelaufen`;
      case "es":
        return `Última ejecución`;
      case "fr":
        return `Dernière exécution`;
      case "ja":
        return `前回の実行`;
      case "ko":
        return `마지막 실행`;
      case "pt-BR":
        return `Última execução`;
      case "zh-Hans":
        return `上次运行`;
      case "zh-Hant":
        return `上次執行`;
      case "en-XA":
        return `[Ļášţ ŕáñ ~~~]`;
      case "ar-XB":
        return `‮Last ran‬`;
    }
    return `Last ran`;
  }
  function settingsPhoneNextRun() {
    switch (currentLanguage()) {
      case "ar":
        return `التشغيل التالي`;
      case "de":
        return `Nächster Lauf`;
      case "es":
        return `Próxima ejecución`;
      case "fr":
        return `Prochaine exécution`;
      case "ja":
        return `次回の実行`;
      case "ko":
        return `다음 실행`;
      case "pt-BR":
        return `Próxima execução`;
      case "zh-Hans":
        return `下次运行`;
      case "zh-Hant":
        return `下次執行`;
      case "en-XA":
        return `[Ñéẋţ ŕûñ ~~~]`;
      case "ar-XB":
        return `‮Next run‬`;
    }
    return `Next run`;
  }
  function settingsPhoneNoAccounts() {
    switch (currentLanguage()) {
      case "ar":
        return `لا توجد حسابات بعد.`;
      case "de":
        return `Noch keine Konten.`;
      case "es":
        return `Aún no hay cuentas.`;
      case "fr":
        return `Pas encore de compte.`;
      case "ja":
        return `アカウントはまだありません。`;
      case "ko":
        return `아직 계정이 없어요.`;
      case "pt-BR":
        return `Ainda não há contas.`;
      case "zh-Hans":
        return `还没有账户。`;
      case "zh-Hant":
        return `還沒有帳號。`;
      case "en-XA":
        return `[Ñö áççöûñţš ýéţ. ~~~~~~]`;
      case "ar-XB":
        return `‮No accounts yet.‬`;
    }
    return `No accounts yet.`;
  }
  function settingsPhoneNoAutomations(input) {
    const home = input.home;
    switch (currentLanguage()) {
      case "ar":
        return `لا توجد عمليات أتمتة بعد. أنشئ واحدة على ${home}، أو أخبر نائب القبطان بما تريد تشغيله ومتى.`;
      case "de":
        return `Noch keine Automatisierungen. Erstell eine auf ${home} oder sag deinem ersten Offizier, was wann laufen soll.`;
      case "es":
        return `Aún no hay automatizaciones. Crea una en ${home}, o dile a tu primer oficial qué ejecutar y cuándo.`;
      case "fr":
        return `Pas encore d’automatisation. Créez-en une sur ${home}, ou dites à votre second quoi exécuter et quand.`;
      case "ja":
        return `自動化はまだありません。${home} で作成するか、何をいつ実行するかを一等航海士に伝えてください。`;
      case "ko":
        return `아직 자동화가 없어요. ${home}에서 만들거나, 일등항해사에게 무엇을 언제 실행할지 말해 주세요.`;
      case "pt-BR":
        return `Ainda não há automações. Crie uma em ${home} ou diga ao seu imediato o que executar e quando.`;
      case "zh-Hans":
        return `还没有自动化。在 ${home} 上创建一个，或者告诉你的大副要运行什么、何时运行。`;
      case "zh-Hant":
        return `還沒有自動化。請在 ${home} 上建立一個，或告訴你的大副要執行什麼、何時執行。`;
      case "en-XA":
        return `[Ñö áûţöɱáţîöñš ýéţ. Ṁáķé öñé öñ ${home}, öŕ ţéļļ ýöûŕ ƒîŕšţ ɱáţé ŵĥáţ ţö ŕûñ áñð ŵĥéñ. ~~~~~~~~~~~~~~~~~~~~~~~~~~~]`;
      case "ar-XB":
        return `‮No automations yet. Make one on ‬${home}‮, or tell your first mate what to run and when.‬`;
    }
    return `No automations yet. Make one on ${home}, or tell your first mate what to run and when.`;
  }
  function settingsPhoneNoProjects(input) {
    const home = input.home;
    switch (currentLanguage()) {
      case "ar":
        return `لا توجد مشاريع بعد. أضف واحدًا في الإعدادات ← المشاريع على ${home}.`;
      case "de":
        return `Noch keine Projekte. Füg eins unter Einstellungen → Projekte auf ${home} hinzu.`;
      case "es":
        return `Aún no hay proyectos. Agrega uno en Configuración → Proyectos en ${home}.`;
      case "fr":
        return `Pas encore de projet. Ajoutez-en un dans Réglages → Projets sur ${home}.`;
      case "ja":
        return `プロジェクトはまだありません。${home} の「設定 → プロジェクト」で追加してください。`;
      case "ko":
        return `아직 프로젝트가 없어요. ${home}의 설정 → 프로젝트에서 추가하세요.`;
      case "pt-BR":
        return `Ainda não há projetos. Adicione um em Ajustes → Projetos em ${home}.`;
      case "zh-Hans":
        return `还没有项目。请在 ${home} 上的“设置” → “项目”中添加一个。`;
      case "zh-Hant":
        return `還沒有專案。請在 ${home} 上的「設定 → 專案」加入一個。`;
      case "en-XA":
        return `[Ñö þŕöĵéçţš ýéţ. Åðð öñé îñ Šéţţîñĝš → Þŕöĵéçţš öñ ${home}. ~~~~~~~~~~~~~~~~~~]`;
      case "ar-XB":
        return `‮No projects yet. Add one in Settings → Projects on ‬${home}‮.‬`;
    }
    return `No projects yet. Add one in Settings → Projects on ${home}.`;
  }
  function settingsPhonePauseAllAsk(input) {
    const count = formatNumber(input.count);
    switch (currentLanguage()) {
      case "ar":
        switch (pluralCategory(input.count)) {
          case "zero":
            return `هل تريد إيقاف عمليات الأتمتة العاملة (${count}) مؤقتًا؟`;
          case "one":
            return `هل تريد إيقاف الأتمتة العاملة (${count}) مؤقتًا؟`;
          case "two":
            return `هل تريد إيقاف عمليتَي الأتمتة العاملتين (${count}) مؤقتًا؟`;
          case "few":
            return `هل تريد إيقاف كل عمليات الأتمتة العاملة (${count}) مؤقتًا؟`;
          case "many":
            return `هل تريد إيقاف كل عمليات الأتمتة العاملة (${count}) مؤقتًا؟`;
          default:
            return `هل تريد إيقاف كل عمليات الأتمتة العاملة (${count}) مؤقتًا؟`;
        }
      case "de":
        switch (pluralCategory(input.count)) {
          case "one":
            return `Die ${count} laufende Automatisierung pausieren?`;
          default:
            return `Alle ${count} laufenden Automatisierungen pausieren?`;
        }
      case "es":
        switch (pluralCategory(input.count)) {
          case "one":
            return `¿Pausar ${count} automatización que se ejecuta?`;
          case "many":
            return `¿Pausar los ${count} de automatizaciones que se ejecutan?`;
          default:
            return `¿Pausar las ${count} automatizaciones que se ejecutan?`;
        }
      case "fr":
        switch (pluralCategory(input.count)) {
          case "one":
            return `Mettre en pause ${count} automatisation active ?`;
          case "many":
            return `Mettre en pause les ${count} automatisations actives ?`;
          default:
            return `Mettre en pause les ${count} automatisations actives ?`;
        }
      case "ja":
        switch (pluralCategory(input.count)) {
          default:
            return `稼働中の自動化（${count}件）をすべて一時停止しますか？`;
        }
      case "ko":
        switch (pluralCategory(input.count)) {
          default:
            return `실행되는 자동화 ${count}개를 일시 정지할까요?`;
        }
      case "pt-BR":
        switch (pluralCategory(input.count)) {
          case "one":
            return `Pausar a ${count} automação em execução?`;
          case "many":
            return `Pausar todas as ${count} automações em execução?`;
          default:
            return `Pausar todas as ${count} automações em execução?`;
        }
      case "zh-Hans":
        switch (pluralCategory(input.count)) {
          default:
            return `要暂停这 ${count} 个会运行的自动化吗？`;
        }
      case "zh-Hant":
        switch (pluralCategory(input.count)) {
          default:
            return `要暫停這 ${count} 項運作中的自動化嗎？`;
        }
      case "en-XA":
        switch (pluralCategory(input.count, "en")) {
          case "one":
            return `[Þáûšé ţĥé ${count} áûţöɱáţîöñ ţĥáţ ŕûñš? ~~~~~~~~~~~]`;
          default:
            return `[Þáûšé áļļ ${count} áûţöɱáţîöñš ţĥáţ ŕûñ? ~~~~~~~~~~~]`;
        }
      case "ar-XB":
        switch (pluralCategory(input.count, "en")) {
          case "one":
            return `‮Pause the ‬${count}‮ automation that runs?‬`;
          default:
            return `‮Pause all ‬${count}‮ automations that run?‬`;
        }
    }
    switch (pluralCategory(input.count)) {
      case "one":
        return `Pause the ${count} automation that runs?`;
      default:
        return `Pause all ${count} automations that run?`;
    }
  }
  function settingsPhoneProjectsThere(input) {
    const home = input.home;
    switch (currentLanguage()) {
      case "ar":
        return `لإضافة مشروع أو إزالته، أو تغيير مجلده، افتح الإعدادات ← المشاريع على ${home}.`;
      case "de":
        return `Um ein Projekt hinzuzufügen oder zu entfernen oder seinen Ordner zu ändern, öffne Einstellungen → Projekte auf ${home}.`;
      case "es":
        return `Para agregar o quitar un proyecto, o cambiar su carpeta, abre Configuración → Proyectos en ${home}.`;
      case "fr":
        return `Pour ajouter ou retirer un projet, ou changer son dossier, ouvrez Réglages → Projets sur ${home}.`;
      case "ja":
        return `プロジェクトの追加や削除、フォルダの変更をするには、${home} で「設定 → プロジェクト」を開いてください。`;
      case "ko":
        return `프로젝트를 추가하거나 제거하거나 폴더를 바꾸려면 ${home}에서 설정 → 프로젝트를 여세요.`;
      case "pt-BR":
        return `Para adicionar ou remover um projeto, ou mudar a pasta dele, abra Ajustes → Projetos em ${home}.`;
      case "zh-Hans":
        return `要添加或移除项目，或更改它的文件夹，请在 ${home} 上打开“设置” → “项目”。`;
      case "zh-Hant":
        return `若要加入或移除專案，或變更它的資料夾，請在 ${home} 上開啟「設定 → 專案」。`;
      case "en-XA":
        return `[Ţö áðð öŕ ŕéɱöṽé á þŕöĵéçţ, öŕ çĥáñĝé îţš ƒöļðéŕ, öþéñ Šéţţîñĝš → Þŕöĵéçţš öñ ${home}. ~~~~~~~~~~~~~~~~~~~~~~~~~~~]`;
      case "ar-XB":
        return `‮To add or remove a project, or change its folder, open Settings → Projects on ‬${home}‮.‬`;
    }
    return `To add or remove a project, or change its folder, open Settings → Projects on ${home}.`;
  }
  function settingsPhoneRunbooksLead() {
    switch (currentLanguage()) {
      case "ar":
        return `إرشادات يتبعها نائب القبطان والطاقم. أوقف أحدها للعمل من دونه.`;
      case "de":
        return `Anleitungen, denen dein erster Offizier und deine Crew folgen. Schalte eine aus, um ohne sie zu arbeiten.`;
      case "es":
        return `Guía que siguen tu primer oficial y tu tripulación. Desactiva un manual para trabajar sin él.`;
      case "fr":
        return `Les instructions que suivent votre second et l’équipage. Désactivez-en une pour travailler sans elle.`;
      case "ja":
        return `一等航海士と乗組員が従う手引きです。オフにすると、その手引きなしで作業します。`;
      case "ko":
        return `일등항해사와 선원들이 따르는 안내예요. 하나를 끄면 그 안내 없이 일해요.`;
      case "pt-BR":
        return `Orientações que seu imediato e a tripulação seguem. Desative uma para trabalhar sem ela.`;
      case "zh-Hans":
        return `你的大副和船员们遵循的指南。关闭其中一份，工作时就不再使用它。`;
      case "zh-Hant":
        return `你的大副和船員遵循的指引。關閉其中一項，工作時就不會用到它。`;
      case "en-XA":
        return `[Ĝûîðáñçé ýöûŕ ƒîŕšţ ɱáţé áñð çŕéŵ ƒöļļöŵ. Ţûŕñ öñé öƒƒ ţö ŵöŕķ ŵîţĥöûţ îţ. ~~~~~~~~~~~~~~~~~~~~~~~~~]`;
      case "ar-XB":
        return `‮Guidance your first mate and crew follow. Turn one off to work without it.‬`;
    }
    return `Guidance your first mate and crew follow. Turn one off to work without it.`;
  }
  function settingsPhoneSave() {
    switch (currentLanguage()) {
      case "ar":
        return `حفظ`;
      case "de":
        return `Speichern`;
      case "es":
        return `Guardar`;
      case "fr":
        return `Enregistrer`;
      case "ja":
        return `保存`;
      case "ko":
        return `저장`;
      case "pt-BR":
        return `Salvar`;
      case "zh-Hans":
        return `保存`;
      case "zh-Hant":
        return `儲存`;
      case "en-XA":
        return `[Šáṽé ~~]`;
      case "ar-XB":
        return `‮Save‬`;
    }
    return `Save`;
  }
  function settingsPhoneSignIn(input) {
    const action = input.action;
    const where = input.where;
    switch (currentLanguage()) {
      case "ar":
        return `${action} ${where}.`;
      case "de":
        return `${action} ${where}.`;
      case "es":
        return `${action} ${where}.`;
      case "fr":
        return `${action} ${where}.`;
      case "ja":
        return `${action}は${where}行ってください。`;
      case "ko":
        return `${where} ${action}.`;
      case "pt-BR":
        return `${action} ${where}.`;
      case "zh-Hans":
        return `${where}${action}。`;
      case "zh-Hant":
        return `${where}${action}。`;
      case "en-XA":
        return `[${action} ${where}. ~]`;
      case "ar-XB":
        return `${action}‮ ‬${where}‮.‬`;
    }
    return `${action} ${where}.`;
  }
  function settingsPhoneSignInAction() {
    switch (currentLanguage()) {
      case "ar":
        return `سجّل الدخول`;
      case "de":
        return `Anmelden`;
      case "es":
        return `Inicia sesión`;
      case "fr":
        return `Connectez-vous`;
      case "ja":
        return `サインイン`;
      case "ko":
        return `로그인하세요`;
      case "pt-BR":
        return `Faça login`;
      case "zh-Hans":
        return `登录`;
      case "zh-Hant":
        return `登入`;
      case "en-XA":
        return `[Šîĝñ îñ ~~~]`;
      case "ar-XB":
        return `‮Sign in‬`;
    }
    return `Sign in`;
  }
  function settingsPhoneStoppedThere(input) {
    const home = input.home;
    const reason = input.reason;
    switch (currentLanguage()) {
      case "ar":
        return `${reason} اختر تكاملها مجددًا في الإعدادات ← الأتمتة على ${home}.`;
      case "de":
        return `${reason} Wähl ihre Integration unter Einstellungen → Automatisierung auf ${home} erneut aus.`;
      case "es":
        return `${reason} Vuelve a elegir su integración en Configuración → Automatización en ${home}.`;
      case "fr":
        return `${reason} Choisissez de nouveau son intégration dans Réglages → Automatisation sur ${home}.`;
      case "ja":
        return `${reason}連携は、${home} の「設定 → 自動化」で選び直してください。`;
      case "ko":
        return `${reason} ${home}의 설정 → 자동화에서 연동을 다시 고르세요.`;
      case "pt-BR":
        return `${reason} Escolha a integração dela de novo em Ajustes → Automação em ${home}.`;
      case "zh-Hans":
        return `${reason} 请在 ${home} 上的“设置” → “自动化”中重新选择它的集成。`;
      case "zh-Hant":
        return `${reason}請在 ${home} 上的「設定 → 自動化」重新選擇它的整合。`;
      case "en-XA":
        return `[${reason} Þîçķ îţš îñţéĝŕáţîöñ áĝáîñ îñ Šéţţîñĝš → Åûţöɱáţîöñ öñ ${home}. ~~~~~~~~~~~~~~~~~~~]`;
      case "ar-XB":
        return `${reason}‮ Pick its integration again in Settings → Automation on ‬${home}‮.‬`;
    }
    return `${reason} Pick its integration again in Settings → Automation on ${home}.`;
  }
  function settingsPhoneTodayPartial() {
    switch (currentLanguage()) {
      case "ar":
        return `اليوم غير مكتمل`;
      case "de":
        return `Heute ist unvollständig`;
      case "es":
        return `Hoy está incompleto`;
      case "fr":
        return `Aujourd’hui est incomplet`;
      case "ja":
        return `今日はまだ途中です`;
      case "ko":
        return `오늘은 아직 진행 중`;
      case "pt-BR":
        return `Hoje está incompleto`;
      case "zh-Hans":
        return `今天尚未结束`;
      case "zh-Hant":
        return `今天尚未結束`;
      case "en-XA":
        return `[Ţöðáý îš þáŕţîáļ ~~~~~~]`;
      case "ar-XB":
        return `‮Today is partial‬`;
    }
    return `Today is partial`;
  }
  function settingsPhoneUsageThere(input) {
    const home = input.home;
    switch (currentLanguage()) {
      case "ar":
        return `المهام الأخيرة وتفاصيل كل نموذج موجودة في الإعدادات ← الاستخدام على ${home}.`;
      case "de":
        return `Letzte Aufgaben und die Details zu jedem Modell stehen unter Einstellungen → Nutzung auf ${home}.`;
      case "es":
        return `Las tareas recientes y el detalle de cada modelo están en Configuración → Uso en ${home}.`;
      case "fr":
        return `Les tâches récentes et le détail de chaque modèle se trouvent dans Réglages → Utilisation sur ${home}.`;
      case "ja":
        return `最近のタスクと各モデルの詳細は、${home} の「設定 → 使用量」にあります。`;
      case "ko":
        return `최근 작업과 모델별 세부 정보는 ${home}의 설정 → 사용량에 있어요.`;
      case "pt-BR":
        return `As tarefas recentes e os detalhes de cada modelo estão em Ajustes → Uso em ${home}.`;
      case "zh-Hans":
        return `最近的任务和各模型的明细在 ${home} 上的“设置” → “用量”中。`;
      case "zh-Hant":
        return `最近的任務和各模型的詳細資料在 ${home} 上的「設定 → 用量」。`;
      case "en-XA":
        return `[Ŕéçéñţ ţášķš áñð éáçĥ ɱöðéļ'š ðéţáîļ áŕé îñ Šéţţîñĝš → Ûšáĝé öñ ${home}. ~~~~~~~~~~~~~~~~~~~~~~]`;
      case "ar-XB":
        return `‮Recent tasks and each model's detail are in Settings → Usage on ‬${home}‮.‬`;
    }
    return `Recent tasks and each model's detail are in Settings → Usage on ${home}.`;
  }
  function settingsProjectsAdvisoryClearsAddress() {
    switch (currentLanguage()) {
      case "ar":
        return `يمسح حفظُ عنوان مستودع آخر مساراتِ العمل الاستشارية لهذا المشروع، لأنها اختيرت لمستودعه الحالي.`;
      case "de":
        return `Wenn du die Adresse eines anderen Repositorys speicherst, werden die unverbindlichen Workflows dieses Projekts gelöscht, denn sie wurden für sein aktuelles Repository gewählt.`;
      case "es":
        return `Guardar la dirección de otro repositorio borra los flujos de trabajo orientativos de este proyecto, que se eligieron para su repositorio actual.`;
      case "fr":
        return `Enregistrer l’adresse d’un autre dépôt efface les workflows indicatifs de ce projet, choisis pour son dépôt actuel.`;
      case "ja":
        return `別のリポジトリのアドレスを保存すると、このプロジェクトの参考ワークフローは消去されます。現在のリポジトリ用に選ばれたものだからです。`;
      case "ko":
        return `다른 저장소의 주소를 저장하면 이 프로젝트의 참고용 워크플로가 지워져요. 지금 저장소에 맞춰 고른 것이기 때문이에요.`;
      case "pt-BR":
        return `Salvar o endereço de outro repositório apaga os fluxos de trabalho informativos deste projeto, escolhidos para o repositório atual dele.`;
      case "zh-Hans":
        return `保存另一个仓库的地址会清除这个项目的参考工作流，因为它们是为当前仓库选的。`;
      case "zh-Hant":
        return `儲存另一個存放庫的位址會清除這個專案的參考工作流程，因為它們是為目前的存放庫選的。`;
      case "en-XA":
        return `[Šáṽîñĝ áñöţĥéŕ ŕéþöšîţöŕý'š áððŕéšš çļéáŕš ţĥîš þŕöĵéçţ'š áðṽîšöŕý ŵöŕķƒļöŵš, ŵĥîçĥ ŵéŕé çĥöšéñ ƒöŕ îţš çûŕŕéñţ ŕéþöšîţöŕý. ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~]`;
      case "ar-XB":
        return `‮Saving another repository's address clears this project's advisory workflows, which were chosen for its current repository.‬`;
    }
    return `Saving another repository's address clears this project's advisory workflows, which were chosen for its current repository.`;
  }
  function settingsProjectsAdvisoryClearsTarget() {
    switch (currentLanguage()) {
      case "ar":
        return `يمسح اختيارُ المشروع الهدف الآخر مساراتِ العمل الاستشارية لهذا المشروع، لأنها اختيرت لمستودعه الحالي.`;
      case "de":
        return `Wenn du das andere Zielprojekt wählst, werden die unverbindlichen Workflows dieses Projekts gelöscht, denn sie wurden für sein aktuelles Repository gewählt.`;
      case "es":
        return `Elegir el otro proyecto de destino borra los flujos de trabajo orientativos de este proyecto, que se eligieron para su repositorio actual.`;
      case "fr":
        return `Choisir l’autre projet cible efface les workflows indicatifs de ce projet, choisis pour son dépôt actuel.`;
      case "ja":
        return `もう一方の対象プロジェクトを選ぶと、このプロジェクトの参考ワークフローは消去されます。現在のリポジトリ用に選ばれたものだからです。`;
      case "ko":
        return `다른 대상 프로젝트를 고르면 이 프로젝트의 참고용 워크플로가 지워져요. 지금 저장소에 맞춰 고른 것이기 때문이에요.`;
      case "pt-BR":
        return `Escolher o outro projeto de destino apaga os fluxos de trabalho informativos deste projeto, escolhidos para o repositório atual dele.`;
      case "zh-Hans":
        return `选择另一个目标项目会清除这个项目的参考工作流，因为它们是为当前仓库选的。`;
      case "zh-Hant":
        return `選擇另一個目標專案會清除這個專案的參考工作流程，因為它們是為目前的存放庫選的。`;
      case "en-XA":
        return `[Çĥööšîñĝ ţĥé öţĥéŕ ţáŕĝéţ þŕöĵéçţ çļéáŕš ţĥîš þŕöĵéçţ'š áðṽîšöŕý ŵöŕķƒļöŵš, ŵĥîçĥ ŵéŕé çĥöšéñ ƒöŕ îţš çûŕŕéñţ ŕéþöšîţöŕý. ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~]`;
      case "ar-XB":
        return `‮Choosing the other target project clears this project's advisory workflows, which were chosen for its current repository.‬`;
    }
    return `Choosing the other target project clears this project's advisory workflows, which were chosen for its current repository.`;
  }
  function settingsProjectsAdvisoryDescription() {
    switch (currentLanguage()) {
      case "ar":
        return `تظهر فحوصات ملفات مسارات عمل GitHub هذه، مثل .github/workflows/early-tests.yml، على التغيير، لكنها لا تعلّق دمجه ولا دفعته أبدًا. ويظل الفحص الذي تشترطه قواعد الفروع في GitHub يعلّق الدمج على GitHub.`;
      case "de":
        return `Überprüfungen aus diesen GitHub-Workflow-Dateien, etwa .github/workflows/early-tests.yml, erscheinen bei einer Änderung, halten aber nie ihr Zusammenführen oder ihr Bündel auf. Eine Überprüfung, die deine Branch-Regeln auf GitHub verlangen, hält das Zusammenführen auf GitHub weiterhin auf.`;
      case "es":
        return `Las comprobaciones de estos archivos de flujo de trabajo de GitHub, como .github/workflows/early-tests.yml, aparecen en un cambio, pero nunca retienen su fusión ni su lote. Una comprobación que exigen tus reglas de rama de GitHub sigue reteniendo la fusión en GitHub.`;
      case "fr":
        return `Les vérifications de ces fichiers de workflow GitHub, comme .github/workflows/early-tests.yml, s’affichent sur une modification, mais ne retiennent jamais sa fusion ni son lot. Une vérification exigée par vos règles de branche GitHub retient toujours la fusion sur GitHub.`;
      case "ja":
        return `これらの GitHub ワークフローファイル（.github/workflows/early-tests.yml など）のチェックは変更に表示されますが、マージや一括プルリクエストを止めることはありません。GitHub のブランチルールで必須のチェックは、引き続き GitHub 上でマージを止めます。`;
      case "ko":
        return `이 GitHub 워크플로 파일(예: .github/workflows/early-tests.yml)의 검사는 변경에 표시되지만, 병합이나 일괄 끌어오기 요청을 막지 않아요. GitHub 분기 규칙에서 필수인 검사는 여전히 GitHub에서 병합을 막아요.`;
      case "pt-BR":
        return `As verificações destes arquivos de fluxo de trabalho do GitHub, como .github/workflows/early-tests.yml, aparecem em uma alteração, mas nunca seguram a mesclagem nem o lote. Uma verificação exigida pelas suas regras de branch do GitHub ainda segura a mesclagem no GitHub.`;
      case "zh-Hans":
        return `这些 GitHub 工作流文件（如 .github/workflows/early-tests.yml）的检查会显示在改动上，但从不阻止它合并，也不阻止这批改动合并。GitHub 分支规则要求的检查仍会在 GitHub 上阻止合并。`;
      case "zh-Hant":
        return `這些 GitHub 工作流程檔案（如 .github/workflows/early-tests.yml）的檢查會顯示在變更上，但從不擋下它的合併或批次。GitHub 分支規則要求的檢查仍會在 GitHub 上擋下合併。`;
      case "en-XA":
        return `[Çĥéçķš ƒŕöɱ ţĥéšé ĜîţĤûƀ ŵöŕķƒļöŵ ƒîļéš, šûçĥ áš .ĝîţĥûƀ/ŵöŕķƒļöŵš/éáŕļý-ţéšţš.ýɱļ, šĥöŵ öñ á çĥáñĝé ƀûţ ñéṽéŕ ĥöļð îţš ɱéŕĝé öŕ îţš ƀáţçĥ. Å çĥéçķ ýöûŕ ĜîţĤûƀ ƀŕáñçĥ ŕûļéš ŕéǫûîŕé šţîļļ ĥöļðš ţĥé ɱéŕĝé öñ ĜîţĤûƀ. ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~]`;
      case "ar-XB":
        return `‮Checks from these GitHub workflow files, such as .github/workflows/early-tests.yml, show on a change but never hold its merge or its batch. A check your GitHub branch rules require still holds the merge on GitHub.‬`;
    }
    return `Checks from these GitHub workflow files, such as .github/workflows/early-tests.yml, show on a change but never hold its merge or its batch. A check your GitHub branch rules require still holds the merge on GitHub.`;
  }
  function settingsProjectsAdvisoryInvalid() {
    switch (currentLanguage()) {
      case "ar":
        return `اذكر كل ملف مسار عمل مرة واحدة، مباشرة في .github/workflows.`;
      case "de":
        return `Nenn jede Workflow-Datei einmal, direkt in .github/workflows.`;
      case "es":
        return `Indica cada archivo de flujo de trabajo una sola vez, directamente en .github/workflows.`;
      case "fr":
        return `Indiquez chaque fichier de workflow une seule fois, directement dans .github/workflows.`;
      case "ja":
        return `各ワークフローファイルを .github/workflows の直下で一度ずつ指定してください。`;
      case "ko":
        return `각 워크플로 파일을 .github/workflows 바로 아래에서 한 번씩 적어 주세요.`;
      case "pt-BR":
        return `Informe cada arquivo de fluxo de trabalho uma vez, diretamente em .github/workflows.`;
      case "zh-Hans":
        return `请直接在 .github/workflows 中写出每个工作流文件，每个只写一次。`;
      case "zh-Hant":
        return `請直接在 .github/workflows 中寫出每個工作流程檔案，每個只寫一次。`;
      case "en-XA":
        return `[Ñáɱé éáçĥ ŵöŕķƒļöŵ ƒîļé öñçé, ðîŕéçţļý îñ .ĝîţĥûƀ/ŵöŕķƒļöŵš. ~~~~~~~~~~~~~~~~~~~~]`;
      case "ar-XB":
        return `‮Name each workflow file once, directly in .github/workflows.‬`;
    }
    return `Name each workflow file once, directly in .github/workflows.`;
  }
  function settingsProjectsAdvisoryLabel() {
    switch (currentLanguage()) {
      case "ar":
        return `ملفات مسارات العمل الاستشارية`;
      case "de":
        return `Dateien unverbindlicher Workflows`;
      case "es":
        return `Archivos de flujos de trabajo orientativos`;
      case "fr":
        return `Fichiers des workflows indicatifs`;
      case "ja":
        return `参考ワークフローのファイル`;
      case "ko":
        return `참고용 워크플로 파일`;
      case "pt-BR":
        return `Arquivos de fluxos de trabalho informativos`;
      case "zh-Hans":
        return `参考工作流文件`;
      case "zh-Hant":
        return `參考工作流程檔案`;
      case "en-XA":
        return `[Åðṽîšöŕý ŵöŕķƒļöŵ ƒîļéš ~~~~~~~~]`;
      case "ar-XB":
        return `‮Advisory workflow files‬`;
    }
    return `Advisory workflow files`;
  }
  function settingsProjectsAdvisoryMovedRefusal() {
    switch (currentLanguage()) {
      case "ar":
        return `لم يُحفظ: ذُكرت مسارات العمل هذه لمستودع لم يعد هذا المشروع يستخدمه. اذكرها من جديد للمستودع الذي يستخدمه الآن.`;
      case "de":
        return `Nicht gespeichert: Diese Workflows wurden für ein Repository genannt, das dieses Projekt nicht mehr nutzt. Nenn sie erneut für das Repository, das es jetzt nutzt.`;
      case "es":
        return `No se guardó: estos flujos de trabajo se indicaron para un repositorio que este proyecto ya no usa. Indícalos de nuevo para el repositorio que usa ahora.`;
      case "fr":
        return `Non enregistré : ces workflows ont été indiqués pour un dépôt que ce projet n’utilise plus. Indiquez-les de nouveau pour le dépôt qu’il utilise maintenant.`;
      case "ja":
        return `保存されませんでした。これらのワークフローは、このプロジェクトがもう使っていないリポジトリ用に指定されたものです。現在使っているリポジトリ用にもう一度指定してください。`;
      case "ko":
        return `저장되지 않았어요. 이 워크플로는 이 프로젝트가 더 이상 쓰지 않는 저장소에 맞춰 적은 것이에요. 지금 쓰는 저장소에 맞춰 다시 적어 주세요.`;
      case "pt-BR":
        return `Não salvo: estes fluxos de trabalho foram informados para um repositório que este projeto não usa mais. Informe-os de novo para o repositório que ele usa agora.`;
      case "zh-Hans":
        return `未保存：这些工作流是为这个项目不再使用的仓库写的。请为它现在使用的仓库重新写出。`;
      case "zh-Hant":
        return `未儲存：這些工作流程是為這個專案不再使用的存放庫寫的。請為它現在使用的存放庫重新寫出。`;
      case "en-XA":
        return `[Ñöţ šáṽéð: ţĥéšé ŵöŕķƒļöŵš ŵéŕé ñáɱéð ƒöŕ á ŕéþöšîţöŕý ţĥîš þŕöĵéçţ ñö ļöñĝéŕ ûšéš. Ñáɱé ţĥéɱ áĝáîñ ƒöŕ ţĥé ŕéþöšîţöŕý îţ ûšéš ñöŵ. ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~]`;
      case "ar-XB":
        return `‮Not saved: these workflows were named for a repository this project no longer uses. Name them again for the repository it uses now.‬`;
    }
    return `Not saved: these workflows were named for a repository this project no longer uses. Name them again for the repository it uses now.`;
  }
  function settingsProjectsAdvisoryTargetRefusal() {
    switch (currentLanguage()) {
      case "ar":
        return `لم يُحفظ: كان المشروع الهدف لهذا المشروع يتغيّر في ذلك الوقت. اذكر مسارات العمل الاستشارية له من جديد.`;
      case "de":
        return `Nicht gespeichert: Das Zielprojekt dieses Projekts wurde gerade geändert. Nenn seine unverbindlichen Workflows erneut.`;
      case "es":
        return `No se guardó: el proyecto de destino de este proyecto estaba cambiando. Indica de nuevo sus flujos de trabajo orientativos.`;
      case "fr":
        return `Non enregistré : le projet cible de ce projet était en train de changer. Indiquez de nouveau ses workflows indicatifs.`;
      case "ja":
        return `保存されませんでした。このプロジェクトの対象プロジェクトが変更中でした。参考ワークフローをもう一度指定してください。`;
      case "ko":
        return `저장되지 않았어요. 이 프로젝트의 대상 프로젝트가 바뀌는 중이었어요. 참고용 워크플로를 다시 적어 주세요.`;
      case "pt-BR":
        return `Não salvo: o projeto de destino deste projeto estava mudando. Informe de novo os fluxos de trabalho informativos dele.`;
      case "zh-Hans":
        return `未保存：这个项目的目标项目当时正在更改。请重新写出它的参考工作流。`;
      case "zh-Hant":
        return `未儲存：這個專案的目標專案當時正在變更。請重新寫出它的參考工作流程。`;
      case "en-XA":
        return `[Ñöţ šáṽéð: ţĥîš þŕöĵéçţ'š ţáŕĝéţ þŕöĵéçţ ŵáš çĥáñĝîñĝ áţ ţĥé ţîɱé. Ñáɱé îţš áðṽîšöŕý ŵöŕķƒļöŵš áĝáîñ. ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~]`;
      case "ar-XB":
        return `‮Not saved: this project's target project was changing at the time. Name its advisory workflows again.‬`;
    }
    return `Not saved: this project's target project was changing at the time. Name its advisory workflows again.`;
  }
  function settingsProjectsAdvisoryTitle() {
    switch (currentLanguage()) {
      case "ar":
        return `مسارات عمل استشارية`;
      case "de":
        return `Unverbindliche Workflows`;
      case "es":
        return `Flujos de trabajo orientativos`;
      case "fr":
        return `Workflows indicatifs`;
      case "ja":
        return `参考ワークフロー`;
      case "ko":
        return `참고용 워크플로`;
      case "pt-BR":
        return `Fluxos de trabalho informativos`;
      case "zh-Hans":
        return `参考工作流`;
      case "zh-Hant":
        return `參考工作流程`;
      case "en-XA":
        return `[Åðṽîšöŕý ŵöŕķƒļöŵš ~~~~~~]`;
      case "ar-XB":
        return `‮Advisory workflows‬`;
    }
    return `Advisory workflows`;
  }
  function settingsProjectsAutonomyOff() {
    switch (currentLanguage()) {
      case "ar":
        return `العمل المنتهي ينتظر كلمتك.`;
      case "de":
        return `Fertige Arbeit wartet auf dein Wort.`;
      case "es":
        return `El trabajo terminado espera tu palabra.`;
      case "fr":
        return `Le travail terminé attend votre accord.`;
      case "ja":
        return `完了した作業はあなたの承認を待ちます。`;
      case "ko":
        return `끝난 작업은 선장님의 말을 기다려요.`;
      case "pt-BR":
        return `O trabalho concluído espera sua palavra.`;
      case "zh-Hans":
        return `完成的工作会等你确认。`;
      case "zh-Hant":
        return `完成的工作會等你同意。`;
      case "en-XA":
        return `[Ƒîñîšĥéð ŵöŕķ ŵáîţš ƒöŕ ýöûŕ ŵöŕð. ~~~~~~~~~~~~]`;
      case "ar-XB":
        return `‮Finished work waits for your word.‬`;
    }
    return `Finished work waits for your word.`;
  }
  function settingsProjectsAutonomyOn() {
    switch (currentLanguage()) {
      case "ar":
        return `العمل الذي يجتاز الفحوصات قد يُدمج دون سؤالك.`;
      case "de":
        return `Arbeit, die die Überprüfungen besteht, darf ohne Rückfrage zusammengeführt werden.`;
      case "es":
        return `El trabajo que supera las comprobaciones puede fusionarse sin preguntarte.`;
      case "fr":
        return `Le travail qui passe les vérifications peut être fusionné sans vous demander.`;
      case "ja":
        return `チェックに合格した作業は、確認なしでマージされることがあります。`;
      case "ko":
        return `검사를 통과한 작업은 묻지 않고 병합될 수 있어요.`;
      case "pt-BR":
        return `O trabalho que passa nas verificações pode ser mesclado sem perguntar a você.`;
      case "zh-Hans":
        return `通过检查的工作可以不经询问直接合并。`;
      case "zh-Hant":
        return `通過檢查的工作可以不問你就合併。`;
      case "en-XA":
        return `[Ŵöŕķ ţĥáţ þáššéš ţĥé çĥéçķš ɱáý ɱéŕĝé ŵîţĥöûţ ášķîñĝ ýöû. ~~~~~~~~~~~~~~~~~~~]`;
      case "ar-XB":
        return `‮Work that passes the checks may merge without asking you.‬`;
    }
    return `Work that passes the checks may merge without asking you.`;
  }
  function settingsProjectsAutonomyPersonal() {
    switch (currentLanguage()) {
      case "ar":
        return `يُبنى في مكانه. العمل الذي يجتاز الفحوصات يُكتب فور انتهائه.`;
      case "de":
        return `Baut direkt im Ordner. Arbeit, die die Überprüfungen besteht, wird geschrieben, sobald sie fertig ist.`;
      case "es":
        return `Se construye en el lugar. El trabajo que supera las comprobaciones se escribe en cuanto está terminado.`;
      case "fr":
        return `Construit sur place. Le travail qui passe les vérifications est écrit dès qu’il est terminé.`;
      case "ja":
        return `その場で作成。チェックに合格した作業は、終わりしだい書き込まれます。`;
      case "ko":
        return `그 자리에서 만들어요. 검사를 통과한 작업은 끝나는 즉시 기록돼요.`;
      case "pt-BR":
        return `Feito no local. O trabalho que passa nas verificações é gravado assim que fica pronto.`;
      case "zh-Hans":
        return `就地构建。通过检查的工作一完成就会写入。`;
      case "zh-Hant":
        return `就地建置。通過檢查的工作一完成就會寫入。`;
      case "en-XA":
        return `[Ɓûîļðš îñ þļáçé. Ŵöŕķ ţĥáţ þáššéš ţĥé çĥéçķš îš ŵŕîţţéñ áš šööñ áš îţ îš ðöñé. ~~~~~~~~~~~~~~~~~~~~~~~~~~]`;
      case "ar-XB":
        return `‮Builds in place. Work that passes the checks is written as soon as it is done.‬`;
    }
    return `Builds in place. Work that passes the checks is written as soon as it is done.`;
  }
  function settingsProjectsBatchNoHost() {
    switch (currentLanguage()) {
      case "ar":
        return `طلبات السحب المجمّعة غير متاحة هنا: لا يستطيع Infinitary فتح طلب سحب مجمّع ودمجه حيث يُستضاف هذا المشروع.`;
      case "de":
        return `Gebündelte Pull Requests gibt es hier nicht: Infinitary kann dort, wo dieses Projekt liegt, keinen gebündelten Pull Request öffnen und zusammenführen.`;
      case "es":
        return `Aquí no se ofrecen solicitudes de incorporación de cambios por lotes: Infinitary no puede abrir ni fusionar una solicitud de incorporación de cambios por lotes en el sitio que aloja este proyecto.`;
      case "fr":
        return `Les demandes de tirage groupées ne sont pas proposées ici : Infinitary ne peut pas ouvrir ni fusionner une demande de tirage groupée chez l’hébergeur de ce projet.`;
      case "ja":
        return `ここでは一括プルリクエストは使えません：このプロジェクトの保管先では、Infinitary が一括プルリクエストを開いてマージできません。`;
      case "ko":
        return `여기서는 일괄 끌어오기 요청을 쓸 수 없어요: 이 프로젝트 호스트에서는 Infinitary가 일괄 끌어오기 요청을 열고 병합할 수 없어요.`;
      case "pt-BR":
        return `Solicitações de pull em lote não são oferecidas aqui: o Infinitary não consegue abrir e mesclar uma solicitação de pull em lote onde este projeto fica.`;
      case "zh-Hans":
        return `这里不提供批量拉取请求：Infinitary 无法在这个项目的托管平台上创建并合并批量拉取请求。`;
      case "zh-Hant":
        return `這裡不提供批次 pull request：Infinitary 無法在這個專案所在處開啟並合併批次 pull request。`;
      case "en-XA":
        return `[Ɓáţçĥéð þûļļ ŕéǫûéšţš áŕé ñöţ öƒƒéŕéð ĥéŕé: Îñƒîñîţáŕý çáññöţ öþéñ áñð ɱéŕĝé á ƀáţçĥ þûļļ ŕéǫûéšţ ŵĥéŕé ţĥîš þŕöĵéçţ ļîṽéš. ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~]`;
      case "ar-XB":
        return `‮Batched pull requests are not offered here: Infinitary cannot open and merge a batch pull request where this project lives.‬`;
    }
    return `Batched pull requests are not offered here: Infinitary cannot open and merge a batch pull request where this project lives.`;
  }
  function settingsProjectsCare() {
    switch (currentLanguage()) {
      case "ar":
        return `العناية`;
      case "de":
        return `Sorgfalt`;
      case "es":
        return `Cuidado`;
      case "fr":
        return `Soin`;
      case "ja":
        return `慎重さ`;
      case "ko":
        return `주의 수준`;
      case "pt-BR":
        return `Cuidado`;
      case "zh-Hans":
        return `把关`;
      case "zh-Hant":
        return `謹慎度`;
      case "en-XA":
        return `[Ŕîĝöŕ ~~]`;
      case "ar-XB":
        return `‮Rigor‬`;
    }
    return `Rigor`;
  }
  function settingsProjectsCareNone() {
    switch (currentLanguage()) {
      case "ar":
        return `لا شيء`;
      case "de":
        return `keine`;
      case "es":
        return `ninguno`;
      case "fr":
        return `aucun`;
      case "ja":
        return `なし`;
      case "ko":
        return `없음`;
      case "pt-BR":
        return `nenhum`;
      case "zh-Hans":
        return `无`;
      case "zh-Hant":
        return `無`;
      case "en-XA":
        return `[ñöñé ~~]`;
      case "ar-XB":
        return `‮none‬`;
    }
    return `none`;
  }
  function settingsProjectsCarePersonal() {
    switch (currentLanguage()) {
      case "ar":
        return `لا شيء هنا يمر عبر بوابة.`;
      case "de":
        return `Hier geht nichts durch eine Prüfstelle.`;
      case "es":
        return `Aquí nada pasa por un control.`;
      case "fr":
        return `Rien ici ne passe par un contrôle.`;
      case "ja":
        return `ここでは何も関門を通りません。`;
      case "ko":
        return `여기서는 어떤 관문도 거치지 않아요.`;
      case "pt-BR":
        return `Nada aqui passa por uma etapa de controle.`;
      case "zh-Hans":
        return `这里的内容不经过任何把关。`;
      case "zh-Hant":
        return `這裡的內容不經過任何關卡。`;
      case "en-XA":
        return `[Ñöţĥîñĝ ĥéŕé þáššéš ţĥŕöûĝĥ á ĝáţé. ~~~~~~~~~~~~]`;
      case "ar-XB":
        return `‮Nothing here passes through a gate.‬`;
    }
    return `Nothing here passes through a gate.`;
  }
  function settingsProjectsCostAmount() {
    switch (currentLanguage()) {
      case "ar":
        return `حد تكلفة المشروع بالدولارات المقدّرة`;
      case "de":
        return `Kostengrenze des Projekts in geschätzten Dollar`;
      case "es":
        return `Límite de costo del proyecto en dólares estimados`;
      case "fr":
        return `Plafond de coût du projet en dollars estimés`;
      case "ja":
        return `プロジェクトのコスト上限（推定ドル）`;
      case "ko":
        return `프로젝트 비용 한도(예상 달러)`;
      case "pt-BR":
        return `Limite de custo do projeto em dólares estimados`;
      case "zh-Hans":
        return `项目费用上限（预估美元）`;
      case "zh-Hant":
        return `專案費用上限（預估美元）`;
      case "en-XA":
        return `[Þŕöĵéçţ çöšţ ļîɱîţ îñ éšţîɱáţéð ðöļļáŕš ~~~~~~~~~~~~~]`;
      case "ar-XB":
        return `‮Project cost limit in estimated dollars‬`;
    }
    return `Project cost limit in estimated dollars`;
  }
  function settingsProjectsCostDescription() {
    switch (currentLanguage()) {
      case "ar":
        return `الدولارات المقدّرة لكل مهمة وكل أجزائها. اتبع حد التطبيق في الذكاء، أو حدّد مبلغًا، أو اختر بلا حد.`;
      case "de":
        return `Geschätzte Dollar für jede Aufgabe samt all ihren Teilen. Folge der Grenze der App unter Intelligenz, leg einen Betrag fest oder wähl keine Grenze.`;
      case "es":
        return `Dólares estimados para cada tarea y todas sus partes. Sigue el límite de la app en Inteligencia, establece un importe o elige sin límite.`;
      case "fr":
        return `Dollars estimés pour chaque tâche et toutes ses parties. Suivez le plafond de l’app dans Intelligence, fixez un montant ou choisissez aucun plafond.`;
      case "ja":
        return `各タスクとそのすべてのパートにかかる推定金額（ドル）です。「インテリジェンス」のアプリの上限に従うか、金額を設定するか、上限なしを選びます。`;
      case "ko":
        return `각 작업과 그 모든 부분에 드는 예상 비용(달러)이에요. 지능에 있는 앱의 한도를 따르거나, 금액을 정하거나, 한도 없음을 고르세요.`;
      case "pt-BR":
        return `Dólares estimados para cada tarefa e todas as suas partes. Siga o limite do app em Inteligência, defina um valor ou escolha sem limite.`;
      case "zh-Hans":
        return `每个任务及其所有部分的预估费用（美元）。可跟随“智能”中的应用上限、设定金额，或选择不设上限。`;
      case "zh-Hant":
        return `每項任務及其所有部分的預估費用（美元）。可以跟隨「智慧等級」中的程式上限、設定金額，或選擇不設上限。`;
      case "en-XA":
        return `[Éšţîɱáţéð ðöļļáŕš ƒöŕ éáçĥ ţášķ áñð áļļ îţš þáŕţš. Ƒöļļöŵ ţĥé áþþ’š ļîɱîţ îñ Îñţéļļîĝéñçé, šéţ áñ áɱöûñţ, öŕ çĥööšé ñö ļîɱîţ. ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~]`;
      case "ar-XB":
        return `‮Estimated dollars for each task and all its parts. Follow the app’s limit in Intelligence, set an amount, or choose no limit.‬`;
    }
    return `Estimated dollars for each task and all its parts. Follow the app’s limit in Intelligence, set an amount, or choose no limit.`;
  }
  function settingsProjectsCostFollow() {
    switch (currentLanguage()) {
      case "ar":
        return `اتباع التطبيق`;
      case "de":
        return `Wie die App`;
      case "es":
        return `Seguir la app`;
      case "fr":
        return `Suivre l’app`;
      case "ja":
        return `アプリに従う`;
      case "ko":
        return `앱 설정 따르기`;
      case "pt-BR":
        return `Seguir o app`;
      case "zh-Hans":
        return `跟随应用`;
      case "zh-Hant":
        return `跟隨程式`;
      case "en-XA":
        return `[Ƒöļļöŵ áþþ ~~~~]`;
      case "ar-XB":
        return `‮Follow app‬`;
    }
    return `Follow app`;
  }
  function settingsProjectsCostNone() {
    switch (currentLanguage()) {
      case "ar":
        return `بلا حد`;
      case "de":
        return `Keine Grenze`;
      case "es":
        return `Sin límite`;
      case "fr":
        return `Aucun plafond`;
      case "ja":
        return `上限なし`;
      case "ko":
        return `한도 없음`;
      case "pt-BR":
        return `Sem limite`;
      case "zh-Hans":
        return `不设上限`;
      case "zh-Hant":
        return `不設上限`;
      case "en-XA":
        return `[Ñö ļîɱîţ ~~~]`;
      case "ar-XB":
        return `‮No limit‬`;
    }
    return `No limit`;
  }
  function settingsProjectsCostOwn() {
    switch (currentLanguage()) {
      case "ar":
        return `مبلغ خاص`;
      case "de":
        return `Eigener Betrag`;
      case "es":
        return `Importe propio`;
      case "fr":
        return `Montant propre`;
      case "ja":
        return `独自の金額`;
      case "ko":
        return `직접 정한 금액`;
      case "pt-BR":
        return `Valor próprio`;
      case "zh-Hans":
        return `自定金额`;
      case "zh-Hant":
        return `自訂金額`;
      case "en-XA":
        return `[Öŵñ áɱöûñţ ~~~~]`;
      case "ar-XB":
        return `‮Own amount‬`;
    }
    return `Own amount`;
  }
  function settingsProjectsCostTitle() {
    switch (currentLanguage()) {
      case "ar":
        return `حد التكلفة`;
      case "de":
        return `Kostengrenze`;
      case "es":
        return `Límite de costo`;
      case "fr":
        return `Plafond de coût`;
      case "ja":
        return `コスト上限`;
      case "ko":
        return `비용 한도`;
      case "pt-BR":
        return `Limite de custo`;
      case "zh-Hans":
        return `费用上限`;
      case "zh-Hant":
        return `費用上限`;
      case "en-XA":
        return `[Çöšţ ļîɱîţ ~~~~]`;
      case "ar-XB":
        return `‮Cost limit‬`;
    }
    return `Cost limit`;
  }
  function settingsProjectsCount(input) {
    const count = formatNumber(input.count);
    switch (currentLanguage()) {
      case "ar":
        switch (pluralCategory(input.count)) {
          case "zero":
            return `${count} مشروع`;
          case "one":
            return `${count} مشروع`;
          case "two":
            return `${count} مشروعان`;
          case "few":
            return `${count} مشاريع`;
          case "many":
            return `${count} مشروعًا`;
          default:
            return `${count} مشروع`;
        }
      case "de":
        switch (pluralCategory(input.count)) {
          case "one":
            return `${count} Projekt`;
          default:
            return `${count} Projekte`;
        }
      case "es":
        switch (pluralCategory(input.count)) {
          case "one":
            return `${count} proyecto`;
          case "many":
            return `${count} de proyectos`;
          default:
            return `${count} proyectos`;
        }
      case "fr":
        switch (pluralCategory(input.count)) {
          case "one":
            return `${count} projet`;
          case "many":
            return `${count} projets`;
          default:
            return `${count} projets`;
        }
      case "ja":
        switch (pluralCategory(input.count)) {
          default:
            return `${count}件のプロジェクト`;
        }
      case "ko":
        switch (pluralCategory(input.count)) {
          default:
            return `프로젝트 ${count}개`;
        }
      case "pt-BR":
        switch (pluralCategory(input.count)) {
          case "one":
            return `${count} projeto`;
          case "many":
            return `${count} projetos`;
          default:
            return `${count} projetos`;
        }
      case "zh-Hans":
        switch (pluralCategory(input.count)) {
          default:
            return `${count} 个项目`;
        }
      case "zh-Hant":
        switch (pluralCategory(input.count)) {
          default:
            return `${count} 個專案`;
        }
      case "en-XA":
        switch (pluralCategory(input.count, "en")) {
          case "one":
            return `[${count} þŕöĵéçţ ~~~]`;
          default:
            return `[${count} þŕöĵéçţš ~~~]`;
        }
      case "ar-XB":
        switch (pluralCategory(input.count, "en")) {
          case "one":
            return `${count}‮ project‬`;
          default:
            return `${count}‮ projects‬`;
        }
    }
    switch (pluralCategory(input.count)) {
      case "one":
        return `${count} project`;
      default:
        return `${count} projects`;
    }
  }
  function settingsProjectsDelivery() {
    switch (currentLanguage()) {
      case "ar":
        return `يُقدَّم كطلب سحب حيث يُستضاف المشروع، أو يُدمج مع تغييراتك الأخرى الموافق عليها كطلب سحب مجمّع واحد، أو يُدمج محليًا دون طلب سحب.`;
      case "de":
        return `Als Pull Request dort angeboten, wo das Projekt liegt, gemeinsam mit deinen anderen bestätigten Änderungen als ein gebündelter Pull Request zusammengeführt, oder lokal zusammengeführt ohne Pull Request.`;
      case "es":
        return `Se ofrece como solicitud de incorporación de cambios donde se aloja el proyecto, se fusiona junto con tus otros cambios aprobados como una sola solicitud de incorporación de cambios por lotes, o se fusiona localmente sin solicitud de incorporación de cambios.`;
      case "fr":
        return `Proposé en demande de tirage là où le projet est hébergé, fusionné avec vos autres modifications approuvées en une seule demande de tirage groupée, ou fusionné localement sans demande de tirage.`;
      case "ja":
        return `プロジェクトの保管先でプルリクエストとして出すか、ほかの承認済みの変更とまとめて1つの一括プルリクエストとしてマージするか、プルリクエストなしでローカルマージします。`;
      case "ko":
        return `프로젝트가 있는 곳에 끌어오기 요청으로 올리거나, 승인된 다른 변경과 함께 하나의 일괄 끌어오기 요청으로 병합하거나, 끌어오기 요청 없이 로컬에서 병합해요.`;
      case "pt-BR":
        return `Oferecido como solicitação de pull onde o projeto fica, mesclado junto com suas outras alterações aprovadas como uma única solicitação de pull em lote, ou mesclado localmente sem solicitação de pull.`;
      case "zh-Hans":
        return `在项目托管处以拉取请求提交、与你其他已批准的改动一起合成一个批量拉取请求合并，或不经拉取请求本地合并。`;
      case "zh-Hant":
        return `在專案所在處以 pull request 提出、與你其他已核准的變更一起合成一個批次 pull request 合併，或不經 pull request 本機合併。`;
      case "en-XA":
        return `[Öƒƒéŕéð áš á þûļļ ŕéǫûéšţ ŵĥéŕé ţĥé þŕöĵéçţ ļîṽéš, ɱéŕĝéð ţöĝéţĥéŕ ŵîţĥ ýöûŕ öţĥéŕ áþþŕöṽéð çĥáñĝéš áš öñé ƀáţçĥ þûļļ ŕéǫûéšţ, öŕ ɱéŕĝéð ļöçáļļý ŵîţĥ ñö þûļļ ŕéǫûéšţ. ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~]`;
      case "ar-XB":
        return `‮Offered as a pull request where the project lives, merged together with your other approved changes as one batch pull request, or merged locally with no pull request.‬`;
    }
    return `Offered as a pull request where the project lives, merged together with your other approved changes as one batch pull request, or merged locally with no pull request.`;
  }
  function settingsProjectsDeliveryNoBatch() {
    switch (currentLanguage()) {
      case "ar":
        return `يُقدَّم كطلب سحب حيث يُستضاف المشروع، أو يُدمج محليًا دون طلب سحب.`;
      case "de":
        return `Als Pull Request dort angeboten, wo das Projekt liegt, oder lokal zusammengeführt ohne Pull Request.`;
      case "es":
        return `Se ofrece como solicitud de incorporación de cambios donde se aloja el proyecto, o se fusiona localmente sin solicitud de incorporación de cambios.`;
      case "fr":
        return `Proposé en demande de tirage là où le projet est hébergé, ou fusionné localement sans demande de tirage.`;
      case "ja":
        return `プロジェクトの保管先でプルリクエストとして出すか、プルリクエストなしでローカルマージします。`;
      case "ko":
        return `프로젝트가 있는 곳에 끌어오기 요청으로 올리거나, 끌어오기 요청 없이 로컬에서 병합해요.`;
      case "pt-BR":
        return `Oferecido como solicitação de pull onde o projeto fica, ou mesclado localmente sem solicitação de pull.`;
      case "zh-Hans":
        return `在项目托管处以拉取请求提交，或不经拉取请求本地合并。`;
      case "zh-Hant":
        return `在專案所在處以 pull request 提出，或不經 pull request 本機合併。`;
      case "en-XA":
        return `[Öƒƒéŕéð áš á þûļļ ŕéǫûéšţ ŵĥéŕé ţĥé þŕöĵéçţ ļîṽéš, öŕ ɱéŕĝéð ļöçáļļý ŵîţĥ ñö þûļļ ŕéǫûéšţ. ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~]`;
      case "ar-XB":
        return `‮Offered as a pull request where the project lives, or merged locally with no pull request.‬`;
    }
    return `Offered as a pull request where the project lives, or merged locally with no pull request.`;
  }
  function settingsProjectsDeliveryTitle() {
    switch (currentLanguage()) {
      case "ar":
        return `إلى أين تذهب التغييرات`;
      case "de":
        return `Wohin Änderungen gehen`;
      case "es":
        return `Adónde van los cambios`;
      case "fr":
        return `Où vont les modifications`;
      case "ja":
        return `変更の届け方`;
      case "ko":
        return `변경이 가는 곳`;
      case "pt-BR":
        return `Para onde vão as alterações`;
      case "zh-Hans":
        return `改动去向`;
      case "zh-Hant":
        return `變更去向`;
      case "en-XA":
        return `[Ŵĥéŕé çĥáñĝéš ĝö ~~~~~~]`;
      case "ar-XB":
        return `‮Where changes go‬`;
    }
    return `Where changes go`;
  }
  function settingsProjectsDisclosure() {
    switch (currentLanguage()) {
      case "ar":
        return `الإفصاح عن مساعدة الذكاء الاصطناعي`;
      case "de":
        return `KI-Unterstützung offenlegen`;
      case "es":
        return `Indicar la ayuda de IA`;
      case "fr":
        return `Signaler l’aide de l’IA`;
      case "ja":
        return `AI の支援を明示する`;
      case "ko":
        return `AI 도움 밝히기`;
      case "pt-BR":
        return `Informar a ajuda de IA`;
      case "zh-Hans":
        return `说明 AI 协助`;
      case "zh-Hant":
        return `說明 AI 協助`;
      case "en-XA":
        return `[Ðîšçļöšé ÅÎ áššîšţáñçé ~~~~~~~~]`;
      case "ar-XB":
        return `‮Disclose AI assistance‬`;
    }
    return `Disclose AI assistance`;
  }
  function settingsProjectsDisclosureLine() {
    switch (currentLanguage()) {
      case "ar":
        return `سطر الإفصاح`;
      case "de":
        return `Offenlegungszeile`;
      case "es":
        return `Línea de aviso`;
      case "fr":
        return `Ligne de mention`;
      case "ja":
        return `明示する行`;
      case "ko":
        return `밝히는 줄`;
      case "pt-BR":
        return `Linha de aviso`;
      case "zh-Hans":
        return `说明行`;
      case "zh-Hant":
        return `說明行`;
      case "en-XA":
        return `[Ðîšçļöšûŕé ļîñé ~~~~~]`;
      case "ar-XB":
        return `‮Disclosure line‬`;
    }
    return `Disclosure line`;
  }
  function settingsProjectsDisclosureOff() {
    switch (currentLanguage()) {
      case "ar":
        return `عندما يراجع فرد من الطاقم طلب سحب فتحه شخص آخر في هذا المشروع، لا يذكر تعليقه أن الذكاء الاصطناعي ساعد في كتابته.`;
      case "de":
        return `Wenn ein Crewmitglied einen Pull Request prüft, den eine andere Person in diesem Projekt geöffnet hat, sagt sein Kommentar nicht, dass KI beim Schreiben geholfen hat.`;
      case "es":
        return `Cuando un tripulante revisa una solicitud de incorporación de cambios que otra persona abrió en este proyecto, su comentario no dice que la IA ayudó a escribirlo.`;
      case "fr":
        return `Quand un équipier relit une demande de tirage qu’une autre personne a ouverte sur ce projet, son commentaire ne dit pas que l’IA a aidé à l’écrire.`;
      case "ja":
        return `ほかの人がこのプロジェクトで開いたプルリクエストを乗組員がレビューしても、そのコメントには AI が書くのを手伝ったことを示しません。`;
      case "ko":
        return `다른 사람이 이 프로젝트에 연 끌어오기 요청을 선원이 검토해도, 남기는 댓글에 AI가 작성을 도왔다는 말이 없어요.`;
      case "pt-BR":
        return `Quando um tripulante revisa uma solicitação de pull que outra pessoa abriu neste projeto, o comentário dele não diz que a IA ajudou a escrever.`;
      case "zh-Hans":
        return `船员审阅他人在此项目中打开的拉取请求时，所发评论不会说明有 AI 协助撰写。`;
      case "zh-Hant":
        return `船員審閱他人在此專案中開啟的 pull request 時，所發留言不會說明有 AI 協助撰寫。`;
      case "en-XA":
        return `[Ŵĥéñ á çŕéŵɱáţé ŕéṽîéŵš á þûļļ ŕéǫûéšţ šöɱéöñé éļšé öþéñéð öñ ţĥîš þŕöĵéçţ, îţš çöɱɱéñţ ðöéš ñöţ šáý ÅÎ ĥéļþéð ŵŕîţé îţ. ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~]`;
      case "ar-XB":
        return `‮When a crewmate reviews a pull request someone else opened on this project, its comment does not say AI helped write it.‬`;
    }
    return `When a crewmate reviews a pull request someone else opened on this project, its comment does not say AI helped write it.`;
  }
  function settingsProjectsDisclosureOn() {
    switch (currentLanguage()) {
      case "ar":
        return `عندما يراجع فرد من الطاقم طلب سحب فتحه شخص آخر في هذا المشروع، يبدأ تعليقه بهذا السطر.`;
      case "de":
        return `Wenn ein Crewmitglied einen Pull Request prüft, den eine andere Person in diesem Projekt geöffnet hat, beginnt sein Kommentar mit dieser Zeile.`;
      case "es":
        return `Cuando un tripulante revisa una solicitud de incorporación de cambios que otra persona abrió en este proyecto, su comentario empieza con esta línea.`;
      case "fr":
        return `Quand un équipier relit une demande de tirage qu’une autre personne a ouverte sur ce projet, son commentaire commence par cette ligne.`;
      case "ja":
        return `ほかの人がこのプロジェクトで開いたプルリクエストを乗組員がレビューすると、そのコメントはこの行から始まります。`;
      case "ko":
        return `다른 사람이 이 프로젝트에 연 끌어오기 요청을 선원이 검토하면, 남기는 댓글이 이 줄로 시작해요.`;
      case "pt-BR":
        return `Quando um tripulante revisa uma solicitação de pull que outra pessoa abriu neste projeto, o comentário dele começa com esta linha.`;
      case "zh-Hans":
        return `船员审阅他人在此项目中打开的拉取请求时，所发评论以这一行开头。`;
      case "zh-Hant":
        return `船員審閱他人在此專案中開啟的 pull request 時，所發留言以這一行開頭。`;
      case "en-XA":
        return `[Ŵĥéñ á çŕéŵɱáţé ŕéṽîéŵš á þûļļ ŕéǫûéšţ šöɱéöñé éļšé öþéñéð öñ ţĥîš þŕöĵéçţ, îţš çöɱɱéñţ öþéñš ŵîţĥ ţĥîš ļîñé. ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~]`;
      case "ar-XB":
        return `‮When a crewmate reviews a pull request someone else opened on this project, its comment opens with this line.‬`;
    }
    return `When a crewmate reviews a pull request someone else opened on this project, its comment opens with this line.`;
  }
  function settingsProjectsLocalCareful() {
    switch (currentLanguage()) {
      case "ar":
        return `التغييرات التي تُدمج محليًا تُنجز بتأنٍّ، دون مراجعة - فلا يوجد طلب سحب للاطلاع عليه.`;
      case "de":
        return `Lokal zusammengeführte Änderungen werden sorgfältig erledigt, aber ohne Review – es gibt keinen Pull Request, den man ansehen könnte.`;
      case "es":
        return `Los cambios que se fusionan localmente se hacen con cuidado, sin revisión: no hay ninguna solicitud de incorporación de cambios que mirar.`;
      case "fr":
        return `Les modifications fusionnées localement sont faites avec minutie, sans revue – il n’y a pas de demande de tirage à examiner.`;
      case "ja":
        return `ローカルでマージされる変更は慎重に行われますが、レビューはありません。確認するプルリクエストがないためです。`;
      case "ko":
        return `로컬에서 병합되는 변경은 검토 없이 신중하게 처리돼요. 살펴볼 끌어오기 요청이 없기 때문이에요.`;
      case "pt-BR":
        return `As alterações mescladas localmente são feitas com cuidado, sem revisão - não há solicitação de pull para olhar.`;
      case "zh-Hans":
        return `本地合并的改动会谨慎完成，但没有审查——因为没有拉取请求可供查看。`;
      case "zh-Hant":
        return `本機合併的變更會謹慎完成，但沒有審查，因為沒有 pull request 可以看。`;
      case "en-XA":
        return `[Çĥáñĝéš ţĥáţ ɱéŕĝé ļöçáļļý áŕé ðöñé çáŕéƒûļļý, ŵîţĥöûţ á ŕéṽîéŵ - ţĥéŕé îš ñö þûļļ ŕéǫûéšţ ţö ļööķ áţ. ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~]`;
      case "ar-XB":
        return `‮Changes that merge locally are done carefully, without a review - there is no pull request to look at.‬`;
    }
    return `Changes that merge locally are done carefully, without a review - there is no pull request to look at.`;
  }
  function settingsProjectsNone() {
    switch (currentLanguage()) {
      case "ar":
        return `لا توجد مشاريع بعد`;
      case "de":
        return `Noch keine Projekte`;
      case "es":
        return `Aún no hay proyectos`;
      case "fr":
        return `Pas encore de projet`;
      case "ja":
        return `プロジェクトはまだありません`;
      case "ko":
        return `아직 프로젝트 없음`;
      case "pt-BR":
        return `Ainda não há projetos`;
      case "zh-Hans":
        return `还没有项目`;
      case "zh-Hant":
        return `還沒有專案`;
      case "en-XA":
        return `[Ñö þŕöĵéçţš ýéţ ~~~~~]`;
      case "ar-XB":
        return `‮No projects yet‬`;
    }
    return `No projects yet`;
  }
  function settingsProjectsRepositoryCount(input) {
    const count = formatNumber(input.count);
    switch (currentLanguage()) {
      case "ar":
        switch (pluralCategory(input.count)) {
          case "zero":
            return `${count} مستودع`;
          case "one":
            return `${count} مستودع`;
          case "two":
            return `${count} مستودعان`;
          case "few":
            return `${count} مستودعات`;
          case "many":
            return `${count} مستودعًا`;
          default:
            return `${count} مستودع`;
        }
      case "de":
        switch (pluralCategory(input.count)) {
          case "one":
            return `${count} Repository`;
          default:
            return `${count} Repositorys`;
        }
      case "es":
        switch (pluralCategory(input.count)) {
          case "one":
            return `${count} repositorio`;
          case "many":
            return `${count} de repositorios`;
          default:
            return `${count} repositorios`;
        }
      case "fr":
        switch (pluralCategory(input.count)) {
          case "one":
            return `${count} dépôt`;
          case "many":
            return `${count} de dépôts`;
          default:
            return `${count} dépôts`;
        }
      case "ja":
        switch (pluralCategory(input.count)) {
          default:
            return `${count} 個のリポジトリ`;
        }
      case "ko":
        switch (pluralCategory(input.count)) {
          default:
            return `저장소 ${count}개`;
        }
      case "pt-BR":
        switch (pluralCategory(input.count)) {
          case "one":
            return `${count} repositório`;
          case "many":
            return `${count} repositórios`;
          default:
            return `${count} repositórios`;
        }
      case "zh-Hans":
        switch (pluralCategory(input.count)) {
          default:
            return `${count} 个仓库`;
        }
      case "zh-Hant":
        switch (pluralCategory(input.count)) {
          default:
            return `${count} 個存放庫`;
        }
      case "en-XA":
        switch (pluralCategory(input.count, "en")) {
          case "one":
            return `[${count} ŕéþöšîţöŕý ~~~~]`;
          default:
            return `[${count} ŕéþöšîţöŕîéš ~~~~~]`;
        }
      case "ar-XB":
        switch (pluralCategory(input.count, "en")) {
          case "one":
            return `${count}‮ repository‬`;
          default:
            return `${count}‮ repositories‬`;
        }
    }
    switch (pluralCategory(input.count)) {
      case "one":
        return `${count} repository`;
      default:
        return `${count} repositories`;
    }
  }
  function settingsProjectsRequireChecks() {
    switch (currentLanguage()) {
      case "ar":
        return `طلب فحوصات طلبات السحب`;
      case "de":
        return `Überprüfungen für Pull Requests verlangen`;
      case "es":
        return `Exigir comprobaciones en las solicitudes de incorporación de cambios`;
      case "fr":
        return `Exiger les vérifications des demandes de tirage`;
      case "ja":
        return `プルリクエストのチェックを必須にする`;
      case "ko":
        return `끌어오기 요청 검사 요구`;
      case "pt-BR":
        return `Exigir verificações nas solicitações de pull`;
      case "zh-Hans":
        return `要求拉取请求检查`;
      case "zh-Hant":
        return `要求 pull request 檢查`;
      case "en-XA":
        return `[Ŕéǫûîŕé þûļļ ŕéǫûéšţ çĥéçķš ~~~~~~~~~]`;
      case "ar-XB":
        return `‮Require pull request checks‬`;
    }
    return `Require pull request checks`;
  }
  function settingsProjectsRequireChecksFound(input) {
    const date2 = input.date;
    const task = input.task;
    switch (currentLanguage()) {
      case "ar":
        return `متوقف منذ ${date2}، حين لم يجد فرد طاقم ${task} أي فحوصات.`;
      case "de":
        return `Aus seit ${date2}, als das Crewmitglied von ${task} keine Überprüfungen fand.`;
      case "es":
        return `Desactivado desde ${date2}, cuando el tripulante de ${task} no encontró comprobaciones.`;
      case "fr":
        return `Désactivé depuis le ${date2}, quand l’équipier de ${task} n’a trouvé aucune vérification.`;
      case "ja":
        return `${date2}からオフ。${task}の乗組員がチェックがないことを確認しました。`;
      case "ko":
        return `${date2}부터 꺼짐. ${task}의 선원이 검사가 없음을 확인했어요.`;
      case "pt-BR":
        return `Desativado desde ${date2}, quando o tripulante de ${task} não encontrou verificações.`;
      case "zh-Hans":
        return `自 ${date2} 起关闭：${task} 的船员发现没有检查。`;
      case "zh-Hant":
        return `自 ${date2} 起關閉：${task} 的船員發現沒有檢查。`;
      case "en-XA":
        return `[Öƒƒ šîñçé ${date2}, ŵĥéñ ţĥé çŕéŵɱáţé öƒ ${task} ƒöûñð ñö çĥéçķš. ~~~~~~~~~~~~~~~~~]`;
      case "ar-XB":
        return `‮Off since ‬${date2}‮, when the crewmate of ‬${task}‮ found no checks.‬`;
    }
    return `Off since ${date2}, when the crewmate of ${task} found no checks.`;
  }
  function settingsProjectsRequireChecksOff() {
    switch (currentLanguage()) {
      case "ar":
        return `هذا المشروع لا يشغّل أي فحوصات، لذا تُدمج تغييراته دون انتظار. أول فحص يعمل يعيد تشغيل هذا الخيار.`;
      case "de":
        return `Dieses Projekt führt keine Überprüfungen aus, daher werden seine Änderungen ohne Warten zusammengeführt. Die erste Überprüfung, die läuft, schaltet dies wieder ein.`;
      case "es":
        return `Este proyecto no ejecuta comprobaciones, así que sus cambios se fusionan sin esperar ninguna. La primera comprobación que se ejecute vuelve a activarlo.`;
      case "fr":
        return `Ce projet n’exécute aucune vérification, donc ses modifications sont fusionnées sans attendre. La première vérification qui s’exécute le réactive.`;
      case "ja":
        return `このプロジェクトはチェックを実行しないため、変更は待たずにマージされます。チェックが1つでも実行されると、この設定はオンに戻ります。`;
      case "ko":
        return `이 프로젝트는 검사를 실행하지 않아서 변경이 기다리지 않고 병합돼요. 검사가 처음 실행되면 이 설정이 다시 켜져요.`;
      case "pt-BR":
        return `Este projeto não roda verificações, então suas alterações são mescladas sem esperar. A primeira verificação que rodar volta a ativar isto.`;
      case "zh-Hans":
        return `这个项目不运行检查，所以改动不用等待就会合并。第一次有检查运行时，这一项会重新打开。`;
      case "zh-Hant":
        return `這個專案不執行檢查，所以變更不用等待就會合併。第一次有檢查執行時，這一項會重新開啟。`;
      case "en-XA":
        return `[Ţĥîš þŕöĵéçţ ŕûñš ñö çĥéçķš, šö îţš çĥáñĝéš ɱéŕĝé ŵîţĥöûţ ŵáîţîñĝ ƒöŕ áñý. Ţĥé ƒîŕšţ çĥéçķ ţĥáţ ŕûñš ţûŕñš ţĥîš ƀáçķ öñ. ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~]`;
      case "ar-XB":
        return `‮This project runs no checks, so its changes merge without waiting for any. The first check that runs turns this back on.‬`;
    }
    return `This project runs no checks, so its changes merge without waiting for any. The first check that runs turns this back on.`;
  }
  function settingsProjectsRequireChecksOn() {
    switch (currentLanguage()) {
      case "ar":
        return `لا يُدمج التغيير إلا بعد أن تجتاز فحوصاته.`;
      case "de":
        return `Eine Änderung wird erst zusammengeführt, wenn ihre Überprüfungen erfolgreich sind.`;
      case "es":
        return `Un cambio se fusiona solo cuando superan sus comprobaciones.`;
      case "fr":
        return `Une modification n’est fusionnée qu’une fois ses vérifications réussies.`;
      case "ja":
        return `変更はチェックに合格してからマージされます。`;
      case "ko":
        return `변경은 검사를 통과한 뒤에만 병합돼요.`;
      case "pt-BR":
        return `Uma alteração só é mesclada depois que suas verificações passam.`;
      case "zh-Hans":
        return `改动要等检查通过后才会合并。`;
      case "zh-Hant":
        return `變更要等檢查通過後才會合併。`;
      case "en-XA":
        return `[Å çĥáñĝé ɱéŕĝéš öñļý öñçé îţš çĥéçķš þášš. ~~~~~~~~~~~~~~]`;
      case "ar-XB":
        return `‮A change merges only once its checks pass.‬`;
    }
    return `A change merges only once its checks pass.`;
  }
  function settingsProjectsRequireChecksSince(input) {
    const date2 = input.date;
    switch (currentLanguage()) {
      case "ar":
        return `متوقف منذ ${date2}.`;
      case "de":
        return `Aus seit ${date2}.`;
      case "es":
        return `Desactivado desde ${date2}.`;
      case "fr":
        return `Désactivé depuis le ${date2}.`;
      case "ja":
        return `${date2}からオフ。`;
      case "ko":
        return `${date2}부터 꺼짐.`;
      case "pt-BR":
        return `Desativado desde ${date2}.`;
      case "zh-Hans":
        return `自 ${date2} 起关闭。`;
      case "zh-Hant":
        return `自 ${date2} 起關閉。`;
      case "en-XA":
        return `[Öƒƒ šîñçé ${date2}. ~~~~]`;
      case "ar-XB":
        return `‮Off since ‬${date2}‮.‬`;
    }
    return `Off since ${date2}.`;
  }
  function settingsProjectsRigorDescription() {
    switch (currentLanguage()) {
      case "ar":
        return `مدى دقة فحص العمل هنا.`;
      case "de":
        return `Wie gründlich die Arbeit hier geprüft wird.`;
      case "es":
        return `Qué tan a fondo se revisa el trabajo aquí.`;
      case "fr":
        return `Le niveau de vérification du travail ici.`;
      case "ja":
        return `ここでの作業をどれだけ念入りに確認するか。`;
      case "ko":
        return `여기서 하는 작업을 얼마나 꼼꼼하게 확인할지 정해요.`;
      case "pt-BR":
        return `Com que rigor o trabalho daqui é verificado.`;
      case "zh-Hans":
        return `这里的工作要检查得多仔细。`;
      case "zh-Hant":
        return `這裡的工作要檢查得多仔細。`;
      case "en-XA":
        return `[Ĥöŵ ţĥöŕöûĝĥļý ŵöŕķ ĥéŕé îš çĥéçķéð. ~~~~~~~~~~~~]`;
      case "ar-XB":
        return `‮How thoroughly work here is checked.‬`;
    }
    return `How thoroughly work here is checked.`;
  }
  function settingsProjectsRowCare(input) {
    const care = input.care;
    switch (currentLanguage()) {
      case "ar":
        return `العناية: ${care}`;
      case "de":
        return `Sorgfalt: ${care}`;
      case "es":
        return `cuidado ${care}`;
      case "fr":
        return `soin ${care}`;
      case "ja":
        return `慎重さ：${care}`;
      case "ko":
        return `주의 수준: ${care}`;
      case "pt-BR":
        return `Cuidado ${care}`;
      case "zh-Hans":
        return `把关：${care}`;
      case "zh-Hant":
        return `謹慎度：${care}`;
      case "en-XA":
        return `[${care} ŕîĝöŕ ~~]`;
      case "ar-XB":
        return `${care}‮ rigor‬`;
    }
    return `${care} rigor`;
  }
  function settingsProjectsRowLinked() {
    switch (currentLanguage()) {
      case "ar":
        return `مرتبط`;
      case "de":
        return `verknüpft`;
      case "es":
        return `vinculado`;
      case "fr":
        return `lié`;
      case "ja":
        return `リンク済み`;
      case "ko":
        return `연결됨`;
      case "pt-BR":
        return `vinculado`;
      case "zh-Hans":
        return `已关联`;
      case "zh-Hant":
        return `已連結`;
      case "en-XA":
        return `[ļîñķéð ~~]`;
      case "ar-XB":
        return `‮linked‬`;
    }
    return `linked`;
  }
  function settingsProjectsRowNoChecks() {
    switch (currentLanguage()) {
      case "ar":
        return `بلا فحوصات`;
      case "de":
        return `keine Überprüfungen`;
      case "es":
        return `sin comprobaciones`;
      case "fr":
        return `aucune vérification`;
      case "ja":
        return `チェックなし`;
      case "ko":
        return `검사 없음`;
      case "pt-BR":
        return `sem verificações`;
      case "zh-Hans":
        return `无检查`;
      case "zh-Hant":
        return `無檢查`;
      case "en-XA":
        return `[ñö çĥéçķš ~~~]`;
      case "ar-XB":
        return `‮no checks‬`;
    }
    return `no checks`;
  }
  function settingsProjectsRowPersonal() {
    switch (currentLanguage()) {
      case "ar":
        return `يُبنى في مكانه`;
      case "de":
        return `baut direkt im Ordner`;
      case "es":
        return `construido en el lugar`;
      case "fr":
        return `construit sur place`;
      case "ja":
        return `その場で作成`;
      case "ko":
        return `그 자리에서 만듦`;
      case "pt-BR":
        return `feito no local`;
      case "zh-Hans":
        return `就地构建`;
      case "zh-Hant":
        return `就地建置`;
      case "en-XA":
        return `[ƀûîļðš îñ þļáçé ~~~~~]`;
      case "ar-XB":
        return `‮builds in place‬`;
    }
    return `builds in place`;
  }
  function settingsProjectsRowRuns(input) {
    const where = input.where;
    switch (currentLanguage()) {
      case "ar":
        return `يعمل ${where}`;
      case "de":
        return `läuft ${where}`;
      case "es":
        return `se ejecuta ${where}`;
      case "fr":
        return `s’exécute ${where}`;
      case "ja":
        return `実行は${where}`;
      case "ko":
        return `${where} 실행`;
      case "pt-BR":
        return `roda ${where}`;
      case "zh-Hans":
        return `${where}运行`;
      case "zh-Hant":
        return `${where}執行`;
      case "en-XA":
        return `[ŕûñš ${where} ~~]`;
      case "ar-XB":
        return `‮runs ‬${where}`;
    }
    return `runs ${where}`;
  }
  function settingsProjectsTargetResetRefusal() {
    switch (currentLanguage()) {
      case "ar":
        return `لم يتغيّر المشروع الهدف، لأن مسارات العمل الاستشارية لهذا المشروع تغيّرت في الوقت نفسه. اختره من جديد.`;
      case "de":
        return `Das Zielprojekt hat sich nicht geändert, weil sich die unverbindlichen Workflows dieses Projekts gleichzeitig geändert haben. Wähl es erneut.`;
      case "es":
        return `El proyecto de destino no cambió, porque los flujos de trabajo orientativos de este proyecto cambiaron al mismo tiempo. Vuelve a elegirlo.`;
      case "fr":
        return `Le projet cible n’a pas changé, car les workflows indicatifs de ce projet ont changé au même moment. Choisissez-le de nouveau.`;
      case "ja":
        return `対象プロジェクトは変更されませんでした。同時にこのプロジェクトの参考ワークフローが変更されたためです。もう一度選んでください。`;
      case "ko":
        return `대상 프로젝트가 바뀌지 않았어요. 같은 때에 이 프로젝트의 참고용 워크플로가 바뀌었기 때문이에요. 다시 골라 주세요.`;
      case "pt-BR":
        return `O projeto de destino não mudou, porque os fluxos de trabalho informativos deste projeto mudaram ao mesmo tempo. Escolha-o de novo.`;
      case "zh-Hans":
        return `目标项目没有更改，因为这个项目的参考工作流同时发生了更改。请重新选择。`;
      case "zh-Hant":
        return `目標專案沒有變更，因為這個專案的參考工作流程同時有了變更。請重新選擇。`;
      case "en-XA":
        return `[Ţĥé ţáŕĝéţ þŕöĵéçţ ðîð ñöţ çĥáñĝé, ƀéçáûšé ţĥîš þŕöĵéçţ'š áðṽîšöŕý ŵöŕķƒļöŵš çĥáñĝéð áţ ţĥé šáɱé ţîɱé. Çĥööšé îţ áĝáîñ. ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~]`;
      case "ar-XB":
        return `‮The target project did not change, because this project's advisory workflows changed at the same time. Choose it again.‬`;
    }
    return `The target project did not change, because this project's advisory workflows changed at the same time. Choose it again.`;
  }
  function settingsProjectsWorkspace() {
    switch (currentLanguage()) {
      case "ar":
        return `مساحة العمل`;
      case "de":
        return `Arbeitsbereich`;
      case "es":
        return `Espacio de trabajo`;
      case "fr":
        return `Espace de travail`;
      case "ja":
        return `ワークスペース`;
      case "ko":
        return `작업 공간`;
      case "pt-BR":
        return `Espaço de trabalho`;
      case "zh-Hans":
        return `工作区`;
      case "zh-Hant":
        return `工作區`;
      case "en-XA":
        return `[Ŵöŕķšþáçé ~~~]`;
      case "ar-XB":
        return `‮Workspace‬`;
    }
    return `Workspace`;
  }
  function settingsProjectsWorkspaceDescription() {
    switch (currentLanguage()) {
      case "ar":
        return `يُبنى في مكانه: لا نسخة عمل ولا طلب سحب.`;
      case "de":
        return `Baut direkt im Ordner: keine Arbeitskopie und kein Pull Request.`;
      case "es":
        return `Se construye en el lugar: sin copia de trabajo y sin solicitud de incorporación de cambios.`;
      case "fr":
        return `Construit sur place : pas de copie de travail ni de demande de tirage.`;
      case "ja":
        return `その場で作成：作業コピーもプルリクエストもありません。`;
      case "ko":
        return `그 자리에서 만들어요: 작업 사본도, 끌어오기 요청도 없어요.`;
      case "pt-BR":
        return `Feito no local: sem cópia de trabalho e sem solicitação de pull.`;
      case "zh-Hans":
        return `就地构建：没有工作副本，也没有拉取请求。`;
      case "zh-Hant":
        return `就地建置：沒有工作副本，也沒有 pull request。`;
      case "en-XA":
        return `[Ɓûîļðš îñ þļáçé: ñö ŵöŕķîñĝ çöþý áñð ñö þûļļ ŕéǫûéšţ. ~~~~~~~~~~~~~~~~~~]`;
      case "ar-XB":
        return `‮Builds in place: no working copy and no pull request.‬`;
    }
    return `Builds in place: no working copy and no pull request.`;
  }
  function settingsRunbooksBuiltIn() {
    switch (currentLanguage()) {
      case "ar":
        return `مدمجة`;
      case "de":
        return `Mitgeliefert`;
      case "es":
        return `Incluidos`;
      case "fr":
        return `Intégrées`;
      case "ja":
        return `組み込み`;
      case "ko":
        return `기본 제공`;
      case "pt-BR":
        return `Incluídos`;
      case "zh-Hans":
        return `内置`;
      case "zh-Hant":
        return `內建`;
      case "en-XA":
        return `[Ɓûîļţ îñ ~~~]`;
      case "ar-XB":
        return `‮Built in‬`;
    }
    return `Built in`;
  }
  function settingsRunbooksFolderRemote(input) {
    const computer = input.computer;
    switch (currentLanguage()) {
      case "ar":
        return `مجلد أدلة التشغيل الخاص بك موجود على ${computer}. افتح أدلة التشغيل واعرضها هناك.`;
      case "de":
        return `Dein Leitfäden-Ordner liegt auf ${computer}. Öffne und lies die Leitfäden dort.`;
      case "es":
        return `Tu carpeta de manuales está en ${computer}. Abre y consulta los manuales allí.`;
      case "fr":
        return `Votre dossier de procédures est sur ${computer}. Ouvrez et consultez les procédures là-bas.`;
      case "ja":
        return `ランブックのフォルダは ${computer} にあります。ランブックはそちらで開いて表示してください。`;
      case "ko":
        return `런북 폴더는 ${computer}에 있어요. 런북은 그곳에서 열어 보세요.`;
      case "pt-BR":
        return `Sua pasta de manuais está em ${computer}. Abra e veja os manuais lá.`;
      case "zh-Hans":
        return `你的操作手册文件夹在 ${computer} 上。请在那里打开和查看操作手册。`;
      case "zh-Hant":
        return `你的作業手冊資料夾在 ${computer} 上。請在那裡開啟和檢視作業手冊。`;
      case "en-XA":
        return `[Ýöûŕ ŕûñƀööķš ƒöļðéŕ îš öñ ${computer}. Öþéñ áñð ṽîéŵ ŕûñƀööķš ţĥéŕé. ~~~~~~~~~~~~~~~~~~~~]`;
      case "ar-XB":
        return `‮Your runbooks folder is on ‬${computer}‮. Open and view runbooks there.‬`;
    }
    return `Your runbooks folder is on ${computer}. Open and view runbooks there.`;
  }
  function settingsRunbooksYours() {
    switch (currentLanguage()) {
      case "ar":
        return `أدلتك`;
      case "de":
        return `Deine`;
      case "es":
        return `Tuyos`;
      case "fr":
        return `Les vôtres`;
      case "ja":
        return `あなたのランブック`;
      case "ko":
        return `내 런북`;
      case "pt-BR":
        return `Seus`;
      case "zh-Hans":
        return `你的`;
      case "zh-Hant":
        return `你的`;
      case "en-XA":
        return `[Ýöûŕš ~~]`;
      case "ar-XB":
        return `‮Yours‬`;
    }
    return `Yours`;
  }
  function settingsRunbooksYoursEmpty() {
    switch (currentLanguage()) {
      case "ar":
        return `تظهر هنا أدلة التشغيل التي تضيفها أو تصنعها مع نائب القبطان.`;
      case "de":
        return `Leitfäden, die du hinzufügst oder mit deinem ersten Offizier erstellst, erscheinen hier.`;
      case "es":
        return `Aquí aparecen los manuales que agregues o crees con el primer oficial.`;
      case "fr":
        return `Les procédures que vous ajoutez ou créez avec le second apparaissent ici.`;
      case "ja":
        return `追加したランブックや、一等航海士と作ったランブックがここに表示されます。`;
      case "ko":
        return `직접 추가하거나 일등항해사와 함께 만든 런북이 여기에 나타나요.`;
      case "pt-BR":
        return `Os manuais que você adicionar ou criar com o imediato aparecem aqui.`;
      case "zh-Hans":
        return `你添加的或与大副一起制作的操作手册会显示在这里。`;
      case "zh-Hant":
        return `你加入的或和大副一起製作的作業手冊會顯示在這裡。`;
      case "en-XA":
        return `[Ŕûñƀööķš ýöû áðð öŕ ɱáķé ŵîţĥ ţĥé ƒîŕšţ ɱáţé áþþéáŕ ĥéŕé. ~~~~~~~~~~~~~~~~~~~]`;
      case "ar-XB":
        return `‮Runbooks you add or make with the first mate appear here.‬`;
    }
    return `Runbooks you add or make with the first mate appear here.`;
  }
  function settingsRunsOnAutomatically() {
    switch (currentLanguage()) {
      case "ar":
        return `تلقائيًا`;
      case "de":
        return `automatisch`;
      case "es":
        return `automáticamente`;
      case "fr":
        return `automatiquement`;
      case "ja":
        return `自動`;
      case "ko":
        return `자동`;
      case "pt-BR":
        return `automaticamente`;
      case "zh-Hans":
        return `自动`;
      case "zh-Hant":
        return `自動`;
      case "en-XA":
        return `[áûţöɱáţîçáļļý ~~~~~]`;
      case "ar-XB":
        return `‮automatically‬`;
    }
    return `automatically`;
  }
  function settingsSubscriptionsApiKeySet(input) {
    const apiKey = input.apiKey;
    switch (currentLanguage()) {
      case "ar":
        return `${apiKey} مضبوط`;
      case "de":
        return `${apiKey} gesetzt`;
      case "es":
        return `${apiKey} configurada`;
      case "fr":
        return `${apiKey} définie`;
      case "ja":
        return `${apiKey} 設定済み`;
      case "ko":
        return `${apiKey} 설정됨`;
      case "pt-BR":
        return `${apiKey} definida`;
      case "zh-Hans":
        return `${apiKey} 已设置`;
      case "zh-Hant":
        return `已設定 ${apiKey}`;
      case "en-XA":
        return `[${apiKey} šéţ ~~]`;
      case "ar-XB":
        return `${apiKey}‮ set‬`;
    }
    return `${apiKey} set`;
  }
  function settingsSubscriptionsAsOfDays(input) {
    const days = input.days;
    switch (currentLanguage()) {
      case "ar":
        return `قبل ${days} ي`;
      case "de":
        return `Stand: vor ${days} T.`;
      case "es":
        return `hace ${days} d`;
      case "fr":
        return `il y a ${days} j`;
      case "ja":
        return `${days}日前の時点`;
      case "ko":
        return `${days}일 전 기준`;
      case "pt-BR":
        return `há ${days} d`;
      case "zh-Hans":
        return `截至 ${days} 天前`;
      case "zh-Hant":
        return `截至 ${days} 天前`;
      case "en-XA":
        return `[áš öƒ ${days}ð áĝö ~~~~]`;
      case "ar-XB":
        return `‮as of ‬${days}‮d ago‬`;
    }
    return `as of ${days}d ago`;
  }
  function settingsSubscriptionsAsOfHours(input) {
    const hours = input.hours;
    switch (currentLanguage()) {
      case "ar":
        return `قبل ${hours} س`;
      case "de":
        return `Stand: vor ${hours} Std.`;
      case "es":
        return `hace ${hours} h`;
      case "fr":
        return `il y a ${hours} h`;
      case "ja":
        return `${hours}時間前の時点`;
      case "ko":
        return `${hours}시간 전 기준`;
      case "pt-BR":
        return `há ${hours} h`;
      case "zh-Hans":
        return `截至 ${hours} 小时前`;
      case "zh-Hant":
        return `截至 ${hours} 小時前`;
      case "en-XA":
        return `[áš öƒ ${hours}ĥ áĝö ~~~~]`;
      case "ar-XB":
        return `‮as of ‬${hours}‮h ago‬`;
    }
    return `as of ${hours}h ago`;
  }
  function settingsSubscriptionsAsOfJustNow() {
    switch (currentLanguage()) {
      case "ar":
        return `قبل لحظات`;
      case "de":
        return `Stand: gerade eben`;
      case "es":
        return `hace un momento`;
      case "fr":
        return `à l’instant`;
      case "ja":
        return `たった今の時点`;
      case "ko":
        return `방금 기준`;
      case "pt-BR":
        return `agora mesmo`;
      case "zh-Hans":
        return `截至刚才`;
      case "zh-Hant":
        return `截至剛才`;
      case "en-XA":
        return `[áš öƒ ĵûšţ ñöŵ ~~~~~]`;
      case "ar-XB":
        return `‮as of just now‬`;
    }
    return `as of just now`;
  }
  function settingsSubscriptionsAsOfMinutes(input) {
    const minutes = input.minutes;
    switch (currentLanguage()) {
      case "ar":
        return `قبل ${minutes} د`;
      case "de":
        return `Stand: vor ${minutes} Min.`;
      case "es":
        return `hace ${minutes} min`;
      case "fr":
        return `il y a ${minutes} min`;
      case "ja":
        return `${minutes}分前の時点`;
      case "ko":
        return `${minutes}분 전 기준`;
      case "pt-BR":
        return `há ${minutes} min`;
      case "zh-Hans":
        return `截至 ${minutes} 分钟前`;
      case "zh-Hant":
        return `截至 ${minutes} 分鐘前`;
      case "en-XA":
        return `[áš öƒ ${minutes}ɱ áĝö ~~~~]`;
      case "ar-XB":
        return `‮as of ‬${minutes}‮m ago‬`;
    }
    return `as of ${minutes}m ago`;
  }
  function settingsSubscriptionsAsOfTime(input) {
    const time2 = input.time;
    switch (currentLanguage()) {
      case "ar":
        return `عند ${time2}`;
      case "de":
        return `Stand: ${time2}`;
      case "es":
        return `a las ${time2}`;
      case "fr":
        return `à ${time2}`;
      case "ja":
        return `${time2} の時点`;
      case "ko":
        return `${time2} 기준`;
      case "pt-BR":
        return `às ${time2}`;
      case "zh-Hans":
        return `截至 ${time2}`;
      case "zh-Hant":
        return `截至 ${time2}`;
      case "en-XA":
        return `[áš öƒ ${time2} ~~]`;
      case "ar-XB":
        return `‮as of ‬${time2}`;
    }
    return `as of ${time2}`;
  }
  function settingsSubscriptionsClaudeFirstRun(input) {
    const here = input.here;
    switch (currentLanguage()) {
      case "ar":
        return `سجّل الدخول بـ Claude على ${here}.`;
      case "de":
        return `Melde dich auf ${here} mit Claude an.`;
      case "es":
        return `Inicia sesión con Claude en ${here}.`;
      case "fr":
        return `Connectez-vous avec Claude sur ${here}.`;
      case "ja":
        return `${here} で Claude にサインインしてください。`;
      case "ko":
        return `${here}에서 Claude로 로그인하세요.`;
      case "pt-BR":
        return `Faça login com o Claude em ${here}.`;
      case "zh-Hans":
        return `在 ${here} 上用 Claude 登录。`;
      case "zh-Hant":
        return `在 ${here} 上使用 Claude 登入。`;
      case "en-XA":
        return `[Šîĝñ îñ ŵîţĥ Çļáûðé öñ ${here}. ~~~~~~~~]`;
      case "ar-XB":
        return `‮Sign in with Claude on ‬${here}‮.‬`;
    }
    return `Sign in with Claude on ${here}.`;
  }
  function settingsSubscriptionsCreditsClaudeAvailable() {
    switch (currentLanguage()) {
      case "ar":
        return `الاستخدام الإضافي مفعّل`;
      case "de":
        return `Zusätzliche Nutzung an`;
      case "es":
        return `Uso adicional activado`;
      case "fr":
        return `Utilisation supplémentaire activée`;
      case "ja":
        return `追加使用量オン`;
      case "ko":
        return `추가 사용량 켜짐`;
      case "pt-BR":
        return `Uso extra ativado`;
      case "zh-Hans":
        return `额外用量已开启`;
      case "zh-Hant":
        return `額外用量已開啟`;
      case "en-XA":
        return `[Éẋţŕá ûšáĝé öñ ~~~~~]`;
      case "ar-XB":
        return `‮Extra usage on‬`;
    }
    return `Extra usage on`;
  }
  function settingsSubscriptionsCreditsClaudeAvailableUsed(input) {
    const percent = input.percent;
    switch (currentLanguage()) {
      case "ar":
        return `الاستخدام الإضافي مفعّل · استُخدم ${percent}% من حدّك الشهري`;
      case "de":
        return `Zusätzliche Nutzung an · ${percent} % deines Monatslimits verbraucht`;
      case "es":
        return `Uso adicional activado · ${percent} % de tu límite mensual usado`;
      case "fr":
        return `Utilisation supplémentaire activée · ${percent} % de votre limite mensuelle utilisés`;
      case "ja":
        return `追加使用量オン · 月間上限の${percent}%を使用`;
      case "ko":
        return `추가 사용량 켜짐 · 월 한도의 ${percent}% 사용`;
      case "pt-BR":
        return `Uso extra ativado · ${percent}% do seu limite mensal usado`;
      case "zh-Hans":
        return `额外用量已开启 · 已用每月上限的 ${percent}%`;
      case "zh-Hant":
        return `額外用量已開啟 · 已用每月上限的 ${percent}%`;
      case "en-XA":
        return `[Éẋţŕá ûšáĝé öñ · ${percent}% öƒ ýöûŕ ɱöñţĥļý ļîɱîţ ûšéð ~~~~~~~~~~~~~~~]`;
      case "ar-XB":
        return `‮Extra usage on · ‬${percent}‮% of your monthly limit used‬`;
    }
    return `Extra usage on · ${percent}% of your monthly limit used`;
  }
  function settingsSubscriptionsCreditsClaudeInUse() {
    switch (currentLanguage()) {
      case "ar":
        return `يجيب الآن على الاستخدام الإضافي`;
      case "de":
        return `Antwortet gerade über zusätzliche Nutzung`;
      case "es":
        return `Respondiendo ahora con uso adicional`;
      case "fr":
        return `Répond en ce moment sur l’utilisation supplémentaire`;
      case "ja":
        return `現在、追加使用量で応答中`;
      case "ko":
        return `지금 추가 사용량으로 응답 중`;
      case "pt-BR":
        return `Respondendo agora com uso extra`;
      case "zh-Hans":
        return `正在使用额外用量回答`;
      case "zh-Hant":
        return `正在使用額外用量回答`;
      case "en-XA":
        return `[Åñšŵéŕîñĝ öñ éẋţŕá ûšáĝé ñöŵ ~~~~~~~~~~]`;
      case "ar-XB":
        return `‮Answering on extra usage now‬`;
    }
    return `Answering on extra usage now`;
  }
  function settingsSubscriptionsCreditsClaudeInUseUsed(input) {
    const percent = input.percent;
    switch (currentLanguage()) {
      case "ar":
        return `يجيب الآن على الاستخدام الإضافي · استُخدم ${percent}% من حدّك الشهري`;
      case "de":
        return `Antwortet gerade über zusätzliche Nutzung · ${percent} % deines Monatslimits verbraucht`;
      case "es":
        return `Respondiendo ahora con uso adicional · ${percent} % de tu límite mensual usado`;
      case "fr":
        return `Répond en ce moment sur l’utilisation supplémentaire · ${percent} % de votre limite mensuelle utilisés`;
      case "ja":
        return `現在、追加使用量で応答中 · 月間上限の${percent}%を使用`;
      case "ko":
        return `지금 추가 사용량으로 응답 중 · 월 한도의 ${percent}% 사용`;
      case "pt-BR":
        return `Respondendo agora com uso extra · ${percent}% do seu limite mensal usado`;
      case "zh-Hans":
        return `正在使用额外用量回答 · 已用每月上限的 ${percent}%`;
      case "zh-Hant":
        return `正在使用額外用量回答 · 已用每月上限的 ${percent}%`;
      case "en-XA":
        return `[Åñšŵéŕîñĝ öñ éẋţŕá ûšáĝé ñöŵ · ${percent}% öƒ ýöûŕ ɱöñţĥļý ļîɱîţ ûšéð ~~~~~~~~~~~~~~~~~~~~]`;
      case "ar-XB":
        return `‮Answering on extra usage now · ‬${percent}‮% of your monthly limit used‬`;
    }
    return `Answering on extra usage now · ${percent}% of your monthly limit used`;
  }
  function settingsSubscriptionsCreditsClaudeOff() {
    switch (currentLanguage()) {
      case "ar":
        return `الاستخدام الإضافي متوقف`;
      case "de":
        return `Zusätzliche Nutzung aus`;
      case "es":
        return `Uso adicional desactivado`;
      case "fr":
        return `Utilisation supplémentaire désactivée`;
      case "ja":
        return `追加使用量オフ`;
      case "ko":
        return `추가 사용량 꺼짐`;
      case "pt-BR":
        return `Uso extra desativado`;
      case "zh-Hans":
        return `额外用量已关闭`;
      case "zh-Hant":
        return `額外用量已關閉`;
      case "en-XA":
        return `[Éẋţŕá ûšáĝé öƒƒ ~~~~~]`;
      case "ar-XB":
        return `‮Extra usage off‬`;
    }
    return `Extra usage off`;
  }
  function settingsSubscriptionsCreditsClaudeSpent() {
    switch (currentLanguage()) {
      case "ar":
        return `نفد الاستخدام الإضافي`;
      case "de":
        return `Zusätzliche Nutzung aufgebraucht`;
      case "es":
        return `Uso adicional agotado`;
      case "fr":
        return `Utilisation supplémentaire épuisée`;
      case "ja":
        return `追加使用量を使い切りました`;
      case "ko":
        return `추가 사용량 소진`;
      case "pt-BR":
        return `Uso extra esgotado`;
      case "zh-Hans":
        return `额外用量已用完`;
      case "zh-Hant":
        return `額外用量已用完`;
      case "en-XA":
        return `[Éẋţŕá ûšáĝé ûšéð ûþ ~~~~~~~]`;
      case "ar-XB":
        return `‮Extra usage used up‬`;
    }
    return `Extra usage used up`;
  }
  function settingsSubscriptionsCreditsCodexAvailable() {
    switch (currentLanguage()) {
      case "ar":
        return `توجد اعتمادات`;
      case "de":
        return `Guthaben vorhanden`;
      case "es":
        return `Créditos disponibles`;
      case "fr":
        return `Crédits disponibles`;
      case "ja":
        return `クレジットあり`;
      case "ko":
        return `크레딧 있음`;
      case "pt-BR":
        return `Créditos disponíveis`;
      case "zh-Hans":
        return `有可用点数`;
      case "zh-Hant":
        return `有可用點數`;
      case "en-XA":
        return `[Çŕéðîţš áṽáîļáƀļé ~~~~~~]`;
      case "ar-XB":
        return `‮Credits available‬`;
    }
    return `Credits available`;
  }
  function settingsSubscriptionsCreditsCodexBalance(input) {
    const balance = input.balance;
    switch (currentLanguage()) {
      case "ar":
        return `الاعتمادات: متبقٍّ ${balance}`;
      case "de":
        return `Guthaben: noch ${balance}`;
      case "es":
        return `Créditos: quedan ${balance}`;
      case "fr":
        return `Crédits : ${balance} restants`;
      case "ja":
        return `クレジット: 残り${balance}`;
      case "ko":
        return `크레딧: ${balance} 남음`;
      case "pt-BR":
        return `Créditos: restam ${balance}`;
      case "zh-Hans":
        return `点数：剩余 ${balance}`;
      case "zh-Hant":
        return `點數：剩餘 ${balance}`;
      case "en-XA":
        return `[Çŕéðîţš: ${balance} ļéƒţ ~~~~~]`;
      case "ar-XB":
        return `‮Credits: ‬${balance}‮ left‬`;
    }
    return `Credits: ${balance} left`;
  }
  function settingsSubscriptionsCreditsCodexOff() {
    switch (currentLanguage()) {
      case "ar":
        return `لا توجد اعتمادات`;
      case "de":
        return `Kein Guthaben`;
      case "es":
        return `Sin créditos`;
      case "fr":
        return `Aucun crédit`;
      case "ja":
        return `クレジットなし`;
      case "ko":
        return `크레딧 없음`;
      case "pt-BR":
        return `Sem créditos`;
      case "zh-Hans":
        return `没有点数`;
      case "zh-Hant":
        return `沒有點數`;
      case "en-XA":
        return `[Ñö çŕéðîţš ~~~~]`;
      case "ar-XB":
        return `‮No credits‬`;
    }
    return `No credits`;
  }
  function settingsSubscriptionsCreditsCodexSpent() {
    switch (currentLanguage()) {
      case "ar":
        return `بلغت حدّ الإنفاق على الاعتمادات`;
      case "de":
        return `Ausgabelimit für Guthaben erreicht`;
      case "es":
        return `Límite de gasto de créditos alcanzado`;
      case "fr":
        return `Limite de dépense des crédits atteinte`;
      case "ja":
        return `クレジットの支出上限に達しました`;
      case "ko":
        return `크레딧 지출 한도 도달`;
      case "pt-BR":
        return `Limite de gasto de créditos atingido`;
      case "zh-Hans":
        return `已达到点数支出上限`;
      case "zh-Hant":
        return `已達到點數支出上限`;
      case "en-XA":
        return `[Çŕéðîţ šþéñðîñĝ ļîɱîţ ŕéáçĥéð ~~~~~~~~~~]`;
      case "ar-XB":
        return `‮Credit spending limit reached‬`;
    }
    return `Credit spending limit reached`;
  }
  function settingsSubscriptionsCreditsCodexUnlimited() {
    switch (currentLanguage()) {
      case "ar":
        return `الاعتمادات: بلا حد`;
      case "de":
        return `Guthaben: ohne Limit`;
      case "es":
        return `Créditos: sin límite`;
      case "fr":
        return `Crédits : sans limite`;
      case "ja":
        return `クレジット: 上限なし`;
      case "ko":
        return `크레딧: 한도 없음`;
      case "pt-BR":
        return `Créditos: sem limite`;
      case "zh-Hans":
        return `点数：无上限`;
      case "zh-Hant":
        return `點數：無上限`;
      case "en-XA":
        return `[Çŕéðîţš: ñö ļîɱîţ ~~~~~~]`;
      case "ar-XB":
        return `‮Credits: no limit‬`;
    }
    return `Credits: no limit`;
  }
  function settingsSubscriptionsCreditsCopilotAvailable() {
    switch (currentLanguage()) {
      case "ar":
        return `طلبات مميزة مدفوعة مفعّلة`;
      case "de":
        return `Bezahlte Premium-Anfragen an`;
      case "es":
        return `Solicitudes premium de pago activadas`;
      case "fr":
        return `Requêtes premium payantes activées`;
      case "ja":
        return `有料プレミアムリクエストオン`;
      case "ko":
        return `유료 프리미엄 요청 켜짐`;
      case "pt-BR":
        return `Solicitações premium pagas ativadas`;
      case "zh-Hans":
        return `付费高级请求已开启`;
      case "zh-Hant":
        return `付費進階請求已開啟`;
      case "en-XA":
        return `[Þáîð þŕéɱîûɱ ŕéǫûéšţš öñ ~~~~~~~~]`;
      case "ar-XB":
        return `‮Paid premium requests on‬`;
    }
    return `Paid premium requests on`;
  }
  function settingsSubscriptionsCreditsCopilotOff() {
    switch (currentLanguage()) {
      case "ar":
        return `طلبات مميزة مدفوعة متوقفة`;
      case "de":
        return `Bezahlte Premium-Anfragen aus`;
      case "es":
        return `Solicitudes premium de pago desactivadas`;
      case "fr":
        return `Requêtes premium payantes désactivées`;
      case "ja":
        return `有料プレミアムリクエストオフ`;
      case "ko":
        return `유료 프리미엄 요청 꺼짐`;
      case "pt-BR":
        return `Solicitações premium pagas desativadas`;
      case "zh-Hans":
        return `付费高级请求已关闭`;
      case "zh-Hant":
        return `付費進階請求已關閉`;
      case "en-XA":
        return `[Þáîð þŕéɱîûɱ ŕéǫûéšţš öƒƒ ~~~~~~~~~]`;
      case "ar-XB":
        return `‮Paid premium requests off‬`;
    }
    return `Paid premium requests off`;
  }
  function settingsSubscriptionsCreditsKeepsGoing() {
    switch (currentLanguage()) {
      case "ar":
        return `يواصل على الاعتمادات`;
      case "de":
        return `macht mit Guthaben weiter`;
      case "es":
        return `sigue con créditos`;
      case "fr":
        return `continue avec les crédits`;
      case "ja":
        return `クレジットで続行`;
      case "ko":
        return `크레딧으로 계속함`;
      case "pt-BR":
        return `continua com créditos`;
      case "zh-Hans":
        return `用点数继续`;
      case "zh-Hant":
        return `用點數繼續`;
      case "en-XA":
        return `[ķééþš ĝöîñĝ öñ çŕéðîţš ~~~~~~~~]`;
      case "ar-XB":
        return `‮keeps going on credits‬`;
    }
    return `keeps going on credits`;
  }
  function settingsSubscriptionsCreditsWhere(input) {
    const site = input.site;
    switch (currentLanguage()) {
      case "ar":
        return `غيّره على ${site}`;
      case "de":
        return `ändern auf ${site}`;
      case "es":
        return `cámbialo en ${site}`;
      case "fr":
        return `modifiable sur ${site}`;
      case "ja":
        return `${site} で変更`;
      case "ko":
        return `${site}에서 변경`;
      case "pt-BR":
        return `altere em ${site}`;
      case "zh-Hans":
        return `在 ${site} 更改`;
      case "zh-Hant":
        return `在 ${site} 變更`;
      case "en-XA":
        return `[çĥáñĝé îţ öñ ${site} ~~~~~]`;
      case "ar-XB":
        return `‮change it on ‬${site}`;
    }
    return `change it on ${site}`;
  }
  function settingsSubscriptionsCrewPreferredMarkTitle() {
    switch (currentLanguage()) {
      case "ar":
        return `يفضّل عمل الطاقم هذا الحساب`;
      case "de":
        return `Crew-Arbeit bevorzugt dieses Konto`;
      case "es":
        return `El trabajo de la tripulación prefiere esta cuenta`;
      case "fr":
        return `Le travail de l’équipage privilégie ce compte`;
      case "ja":
        return `乗組員の作業はこのアカウントを優先します`;
      case "ko":
        return `선원들의 작업은 이 계정을 우선해요`;
      case "pt-BR":
        return `O trabalho da tripulação prefere esta conta`;
      case "zh-Hans":
        return `船员工作优先使用这个账户`;
      case "zh-Hant":
        return `船員工作優先使用這個帳號`;
      case "en-XA":
        return `[Çŕéŵ ŵöŕķ þŕéƒéŕš ţĥîš áççöûñţ ~~~~~~~~~~]`;
      case "ar-XB":
        return `‮Crew work prefers this account‬`;
    }
    return `Crew work prefers this account`;
  }
  function settingsSubscriptionsDotNoReading(input) {
    const signedIn = input.signedIn;
    switch (currentLanguage()) {
      case "ar":
        return `${signedIn} · لا قراءة للرصيد`;
      case "de":
        return `${signedIn} · kein Kontingent gelesen`;
      case "es":
        return `${signedIn} · sin lectura de la asignación`;
      case "fr":
        return `${signedIn} · aucune lecture de l’allocation`;
      case "ja":
        return `${signedIn} · 利用枠の読み取りなし`;
      case "ko":
        return `${signedIn} · 읽은 사용 한도 없음`;
      case "pt-BR":
        return `${signedIn} · sem leitura da franquia`;
      case "zh-Hans":
        return `${signedIn} · 没有额度读数`;
      case "zh-Hant":
        return `${signedIn} · 沒有方案額度讀數`;
      case "en-XA":
        return `[${signedIn} · ñö áļļöŵáñçé ŕéáðîñĝ ~~~~~~~~]`;
      case "ar-XB":
        return `${signedIn}‮ · no allowance reading‬`;
    }
    return `${signedIn} · no allowance reading`;
  }
  function settingsSubscriptionsDotNotSignedInYet() {
    switch (currentLanguage()) {
      case "ar":
        return `لم يُسجَّل الدخول بعد`;
      case "de":
        return `noch nicht angemeldet`;
      case "es":
        return `todavía sin iniciar sesión`;
      case "fr":
        return `pas encore connecté`;
      case "ja":
        return `まだサインインしていません`;
      case "ko":
        return `아직 로그인 안 함`;
      case "pt-BR":
        return `login ainda não feito`;
      case "zh-Hans":
        return `尚未登录`;
      case "zh-Hant":
        return `尚未登入`;
      case "en-XA":
        return `[ñöţ šîĝñéð îñ ýéţ ~~~~~~]`;
      case "ar-XB":
        return `‮not signed in yet‬`;
    }
    return `not signed in yet`;
  }
  function settingsSubscriptionsDotReading(input) {
    const signedIn = input.signedIn;
    switch (currentLanguage()) {
      case "ar":
        return `${signedIn} · جارٍ القراءة…`;
      case "de":
        return `${signedIn} · wird gelesen …`;
      case "es":
        return `${signedIn} · leyendo…`;
      case "fr":
        return `${signedIn} · lecture…`;
      case "ja":
        return `${signedIn} · 読み取り中…`;
      case "ko":
        return `${signedIn} · 읽는 중…`;
      case "pt-BR":
        return `${signedIn} · lendo…`;
      case "zh-Hans":
        return `${signedIn} · 正在读取…`;
      case "zh-Hant":
        return `${signedIn} · 讀取中…`;
      case "en-XA":
        return `[${signedIn} · ŕéáðîñĝ… ~~~~]`;
      case "ar-XB":
        return `${signedIn}‮ · reading…‬`;
    }
    return `${signedIn} · reading…`;
  }
  function settingsSubscriptionsDotSignInAgain() {
    switch (currentLanguage()) {
      case "ar":
        return `سجّل الدخول مجددًا`;
      case "de":
        return `erneut anmelden`;
      case "es":
        return `vuelve a iniciar sesión`;
      case "fr":
        return `reconnectez-vous`;
      case "ja":
        return `もう一度サインイン`;
      case "ko":
        return `다시 로그인`;
      case "pt-BR":
        return `faça login de novo`;
      case "zh-Hans":
        return `重新登录`;
      case "zh-Hant":
        return `重新登入`;
      case "en-XA":
        return `[šîĝñ îñ áĝáîñ ~~~~~]`;
      case "ar-XB":
        return `‮sign in again‬`;
    }
    return `sign in again`;
  }
  function settingsSubscriptionsDotStale(input) {
    const signedIn = input.signedIn;
    switch (currentLanguage()) {
      case "ar":
        return `${signedIn} · آخر قراءة قديمة`;
      case "de":
        return `${signedIn} · letzter Stand veraltet`;
      case "es":
        return `${signedIn} · la última lectura está desactualizada`;
      case "fr":
        return `${signedIn} · la dernière lecture n’est plus à jour`;
      case "ja":
        return `${signedIn} · 前回の読み取りは古くなっています`;
      case "ko":
        return `${signedIn} · 마지막으로 읽은 값이 오래됨`;
      case "pt-BR":
        return `${signedIn} · a última leitura está desatualizada`;
      case "zh-Hans":
        return `${signedIn} · 上次读取已过时`;
      case "zh-Hant":
        return `${signedIn} · 上次讀取已過時`;
      case "en-XA":
        return `[${signedIn} · ļášţ ŕéáðîñĝ îš šţáļé ~~~~~~~~]`;
      case "ar-XB":
        return `${signedIn}‮ · last reading is stale‬`;
    }
    return `${signedIn} · last reading is stale`;
  }
  function settingsSubscriptionsEmptyIn(input) {
    const duration2 = input.duration;
    switch (currentLanguage()) {
      case "ar":
        return `ينفد خلال ${duration2}`;
      case "de":
        return `leer in ${duration2}`;
      case "es":
        return `se agota en ${duration2}`;
      case "fr":
        return `épuisée dans ${duration2}`;
      case "ja":
        return `${duration2} で使い切り`;
      case "ko":
        return `${duration2} 후 소진`;
      case "pt-BR":
        return `esgota em ${duration2}`;
      case "zh-Hans":
        return `${duration2} 后用完`;
      case "zh-Hant":
        return `${duration2} 後用完`;
      case "en-XA":
        return `[éɱþţý îñ ${duration2} ~~~]`;
      case "ar-XB":
        return `‮empty in ‬${duration2}`;
    }
    return `empty in ${duration2}`;
  }
  function settingsSubscriptionsEmptyNotYet() {
    switch (currentLanguage()) {
      case "ar":
        return `لا قراءة للرصيد بعد.`;
      case "de":
        return `Noch kein Kontingent gelesen.`;
      case "es":
        return `Todavía no hay lectura de la asignación.`;
      case "fr":
        return `Aucune lecture de l’allocation pour l’instant.`;
      case "ja":
        return `利用枠はまだ読み取っていません。`;
      case "ko":
        return `아직 읽은 사용 한도가 없어요.`;
      case "pt-BR":
        return `Ainda não há leitura da franquia.`;
      case "zh-Hans":
        return `还没有读取到额度。`;
      case "zh-Hant":
        return `還沒有讀取到方案額度。`;
      case "en-XA":
        return `[Ñö áļļöŵáñçé ŕéáðîñĝ ýéţ. ~~~~~~~~~]`;
      case "ar-XB":
        return `‮No allowance reading yet.‬`;
    }
    return `No allowance reading yet.`;
  }
  function settingsSubscriptionsEmptyNow() {
    switch (currentLanguage()) {
      case "ar":
        return `نفد الآن`;
      case "de":
        return `jetzt leer`;
      case "es":
        return `agotada`;
      case "fr":
        return `épuisée`;
      case "ja":
        return `使い切りました`;
      case "ko":
        return `지금 소진됨`;
      case "pt-BR":
        return `esgotada`;
      case "zh-Hans":
        return `已用完`;
      case "zh-Hant":
        return `已用完`;
      case "en-XA":
        return `[éɱþţý ñöŵ ~~~]`;
      case "ar-XB":
        return `‮empty now‬`;
    }
    return `empty now`;
  }
  function settingsSubscriptionsEmptySignInAgain() {
    switch (currentLanguage()) {
      case "ar":
        return `سجّل الدخول مجددًا لترى رصيد باقتك.`;
      case "de":
        return `Melde dich erneut an, um dein Kontingent zu sehen.`;
      case "es":
        return `Vuelve a iniciar sesión para ver tu asignación.`;
      case "fr":
        return `Reconnectez-vous pour voir votre allocation.`;
      case "ja":
        return `利用枠を見るには、もう一度サインインしてください。`;
      case "ko":
        return `사용 한도를 보려면 다시 로그인하세요.`;
      case "pt-BR":
        return `Faça login de novo para ver sua franquia.`;
      case "zh-Hans":
        return `重新登录以查看你的额度。`;
      case "zh-Hant":
        return `重新登入以查看你的方案額度。`;
      case "en-XA":
        return `[Šîĝñ îñ áĝáîñ ţö šéé ýöûŕ áļļöŵáñçé. ~~~~~~~~~~~~]`;
      case "ar-XB":
        return `‮Sign in again to see your allowance.‬`;
    }
    return `Sign in again to see your allowance.`;
  }
  function settingsSubscriptionsEmptySlowDown() {
    switch (currentLanguage()) {
      case "ar":
        return `تتعذّر قراءة رصيد باقتك الآن - طلب المزوّد منّا التمهّل.`;
      case "de":
        return `Dein Kontingent kann gerade nicht gelesen werden – der Anbieter hat uns gebeten, langsamer zu machen.`;
      case "es":
        return `Ahora no se puede leer tu asignación: el proveedor pidió que vayamos más despacio.`;
      case "fr":
        return `Votre allocation ne peut pas être lue pour l’instant – le fournisseur nous a demandé de ralentir.`;
      case "ja":
        return `現在、利用枠を読み取れません - プロバイダーから間隔をあけるよう求められました。`;
      case "ko":
        return `지금은 사용 한도를 읽을 수 없어요 - 제공자가 요청 속도를 늦춰 달라고 했어요.`;
      case "pt-BR":
        return `Não dá para ler sua franquia agora - o provedor pediu para irmos mais devagar.`;
      case "zh-Hans":
        return `暂时无法读取你的额度 - 服务商要求我们放慢速度。`;
      case "zh-Hant":
        return `目前無法讀取你的方案額度 - 供應商要求我們放慢速度。`;
      case "en-XA":
        return `[Ýöûŕ áļļöŵáñçé çáñ'ţ ƀé ŕéáð ŕîĝĥţ ñöŵ - ţĥé þŕöṽîðéŕ ášķéð ûš ţö šļöŵ ðöŵñ. ~~~~~~~~~~~~~~~~~~~~~~~~~~]`;
      case "ar-XB":
        return `‮Your allowance can't be read right now - the provider asked us to slow down.‬`;
    }
    return `Your allowance can't be read right now - the provider asked us to slow down.`;
  }
  function settingsSubscriptionsEmptyUnread() {
    switch (currentLanguage()) {
      case "ar":
        return `تعذّرت قراءة رصيد باقتك الآن.`;
      case "de":
        return `Dein Kontingent konnte gerade nicht gelesen werden.`;
      case "es":
        return `No se pudo leer tu asignación en este momento.`;
      case "fr":
        return `Votre allocation n’a pas pu être lue pour l’instant.`;
      case "ja":
        return `現在、利用枠を読み取れませんでした。`;
      case "ko":
        return `지금은 사용 한도를 읽을 수 없었어요.`;
      case "pt-BR":
        return `Não foi possível ler sua franquia agora.`;
      case "zh-Hans":
        return `暂时无法读取你的额度。`;
      case "zh-Hant":
        return `目前無法讀取你的方案額度。`;
      case "en-XA":
        return `[Ýöûŕ áļļöŵáñçé çöûļðñ'ţ ƀé ŕéáð ĵûšţ ñöŵ. ~~~~~~~~~~~~~~]`;
      case "ar-XB":
        return `‮Your allowance couldn't be read just now.‬`;
    }
    return `Your allowance couldn't be read just now.`;
  }
  function settingsSubscriptionsFirstmateAccountTag() {
    switch (currentLanguage()) {
      case "ar":
        return `النائب`;
      case "de":
        return `Offizier`;
      case "es":
        return `primer oficial`;
      case "fr":
        return `second`;
      case "ja":
        return `航海士`;
      case "ko":
        return `일등항해사`;
      case "pt-BR":
        return `imediato`;
      case "zh-Hans":
        return `大副`;
      case "zh-Hant":
        return `大副`;
      case "en-XA":
        return `[ƒîŕšţɱáţé ~~~]`;
      case "ar-XB":
        return `‮firstmate‬`;
    }
    return `firstmate`;
  }
  function settingsSubscriptionsFirstmateAccountTagTitle() {
    switch (currentLanguage()) {
      case "ar":
        return `يعمل نائب القبطان على هذا الحساب`;
      case "de":
        return `Dein erster Offizier läuft mit diesem Konto`;
      case "es":
        return `Tu primer oficial funciona con esta cuenta`;
      case "fr":
        return `Votre second fonctionne avec ce compte`;
      case "ja":
        return `一等航海士はこのアカウントで動いています`;
      case "ko":
        return `일등항해사가 이 계정에서 실행돼요`;
      case "pt-BR":
        return `Seu imediato roda nesta conta`;
      case "zh-Hans":
        return `你的大副在这个账户上运行`;
      case "zh-Hant":
        return `你的大副在這個帳號上運作`;
      case "en-XA":
        return `[Ýöûŕ ƒîŕšţ ɱáţé ŕûñš öñ ţĥîš áççöûñţ ~~~~~~~~~~~~]`;
      case "ar-XB":
        return `‮Your first mate runs on this account‬`;
    }
    return `Your first mate runs on this account`;
  }
  function settingsSubscriptionsKindSubscription() {
    switch (currentLanguage()) {
      case "ar":
        return `اشتراك`;
      case "de":
        return `Abo`;
      case "es":
        return `suscripción`;
      case "fr":
        return `abonnement`;
      case "ja":
        return `サブスクリプション`;
      case "ko":
        return `구독`;
      case "pt-BR":
        return `assinatura`;
      case "zh-Hans":
        return `订阅`;
      case "zh-Hant":
        return `訂閱方案`;
      case "en-XA":
        return `[šûƀšçŕîþţîöñ ~~~~]`;
      case "ar-XB":
        return `‮subscription‬`;
    }
    return `subscription`;
  }
  function settingsSubscriptionsNoReader() {
    switch (currentLanguage()) {
      case "ar":
        return `لا يقرأ Infinitary الرصيد لدى هذا المزوّد.`;
      case "de":
        return `Infinitary liest das Kontingent dieses Anbieters nicht.`;
      case "es":
        return `Infinitary no lee la asignación de este proveedor.`;
      case "fr":
        return `Infinitary ne lit pas l’allocation de ce fournisseur.`;
      case "ja":
        return `Infinitary はこのプロバイダーの利用枠を読み取りません。`;
      case "ko":
        return `Infinitary는 이 제공자의 사용 한도를 읽지 않아요.`;
      case "pt-BR":
        return `O Infinitary não lê a franquia deste provedor.`;
      case "zh-Hans":
        return `Infinitary 不读取这个服务商的额度。`;
      case "zh-Hant":
        return `Infinitary 不會讀取這個供應商的方案額度。`;
      case "en-XA":
        return `[Îñƒîñîţáŕý ðöéšñ'ţ ŕéáð ţĥé áļļöŵáñçé ƒöŕ ţĥîš þŕöṽîðéŕ. ~~~~~~~~~~~~~~~~~~~]`;
      case "ar-XB":
        return `‮Infinitary doesn't read the allowance for this provider.‬`;
    }
    return `Infinitary doesn't read the allowance for this provider.`;
  }
  function settingsSubscriptionsNoReaderKey(input) {
    const apiKey = input.apiKey;
    switch (currentLanguage()) {
      case "ar":
        return `${apiKey} مضبوط · لا يقرأ Infinitary الرصيد لدى هذا المزوّد.`;
      case "de":
        return `${apiKey} gesetzt · Infinitary liest das Kontingent dieses Anbieters nicht.`;
      case "es":
        return `${apiKey} configurada · Infinitary no lee la asignación de este proveedor.`;
      case "fr":
        return `${apiKey} définie · Infinitary ne lit pas l’allocation de ce fournisseur.`;
      case "ja":
        return `${apiKey} 設定済み · Infinitary はこのプロバイダーの利用枠を読み取りません。`;
      case "ko":
        return `${apiKey} 설정됨 · Infinitary는 이 제공자의 사용 한도를 읽지 않아요.`;
      case "pt-BR":
        return `${apiKey} definida · O Infinitary não lê a franquia deste provedor.`;
      case "zh-Hans":
        return `${apiKey} 已设置 · Infinitary 不读取这个服务商的额度。`;
      case "zh-Hant":
        return `已設定 ${apiKey} · Infinitary 不會讀取這個供應商的方案額度。`;
      case "en-XA":
        return `[${apiKey} šéţ · Îñƒîñîţáŕý ðöéšñ'ţ ŕéáð ţĥé áļļöŵáñçé ƒöŕ ţĥîš þŕöṽîðéŕ. ~~~~~~~~~~~~~~~~~~~~~]`;
      case "ar-XB":
        return `${apiKey}‮ set · Infinitary doesn't read the allowance for this provider.‬`;
    }
    return `${apiKey} set · Infinitary doesn't read the allowance for this provider.`;
  }
  function settingsSubscriptionsNotReady() {
    switch (currentLanguage()) {
      case "ar":
        return `غير جاهز`;
      case "de":
        return `nicht bereit`;
      case "es":
        return `no está lista`;
      case "fr":
        return `pas prêt`;
      case "ja":
        return `準備中`;
      case "ko":
        return `준비 안 됨`;
      case "pt-BR":
        return `não está pronta`;
      case "zh-Hans":
        return `未就绪`;
      case "zh-Hant":
        return `尚未就緒`;
      case "en-XA":
        return `[ñöţ ŕéáðý ~~~]`;
      case "ar-XB":
        return `‮not ready‬`;
    }
    return `not ready`;
  }
  function settingsSubscriptionsOnPace() {
    switch (currentLanguage()) {
      case "ar":
        return `الوتيرة مناسبة`;
      case "de":
        return `im Plan`;
      case "es":
        return `al ritmo`;
      case "fr":
        return `dans le rythme`;
      case "ja":
        return `ペースどおり`;
      case "ko":
        return `속도 적정`;
      case "pt-BR":
        return `no ritmo`;
      case "zh-Hans":
        return `正常`;
      case "zh-Hant":
        return `剛好`;
      case "en-XA":
        return `[öñ þáçé ~~~]`;
      case "ar-XB":
        return `‮on pace‬`;
    }
    return `on pace`;
  }
  function settingsSubscriptionsOnPaceAll() {
    switch (currentLanguage()) {
      case "ar":
        return `الوتيرة مناسبة ✓`;
      case "de":
        return `im Plan ✓`;
      case "es":
        return `al ritmo ✓`;
      case "fr":
        return `dans le rythme ✓`;
      case "ja":
        return `ペースどおり ✓`;
      case "ko":
        return `속도 적정 ✓`;
      case "pt-BR":
        return `no ritmo ✓`;
      case "zh-Hans":
        return `正常 ✓`;
      case "zh-Hant":
        return `剛好 ✓`;
      case "en-XA":
        return `[öñ þáçé ✓ ~~~]`;
      case "ar-XB":
        return `‮on pace ✓‬`;
    }
    return `on pace ✓`;
  }
  function settingsSubscriptionsPaused() {
    switch (currentLanguage()) {
      case "ar":
        return `متوقف مؤقتًا`;
      case "de":
        return `pausiert`;
      case "es":
        return `en pausa`;
      case "fr":
        return `en pause`;
      case "ja":
        return `一時停止中`;
      case "ko":
        return `일시 정지됨`;
      case "pt-BR":
        return `pausada`;
      case "zh-Hans":
        return `已暂停`;
      case "zh-Hant":
        return `已暫停`;
      case "en-XA":
        return `[þáûšéð ~~]`;
      case "ar-XB":
        return `‮paused‬`;
    }
    return `paused`;
  }
  function settingsSubscriptionsReading() {
    switch (currentLanguage()) {
      case "ar":
        return `جارٍ القراءة…`;
      case "de":
        return `wird gelesen …`;
      case "es":
        return `leyendo…`;
      case "fr":
        return `lecture…`;
      case "ja":
        return `読み取り中…`;
      case "ko":
        return `읽는 중…`;
      case "pt-BR":
        return `lendo…`;
      case "zh-Hans":
        return `正在读取…`;
      case "zh-Hant":
        return `讀取中…`;
      case "en-XA":
        return `[ŕéáðîñĝ… ~~~]`;
      case "ar-XB":
        return `‮reading…‬`;
    }
    return `reading…`;
  }
  function settingsSubscriptionsRefusedHoldLabel() {
    switch (currentLanguage()) {
      case "ar":
        return `مرفوض`;
      case "de":
        return `abgelehnt`;
      case "es":
        return `rechazado`;
      case "fr":
        return `refusée`;
      case "ja":
        return `拒否されています`;
      case "ko":
        return `거부 중`;
      case "pt-BR":
        return `recusado`;
      case "zh-Hans":
        return `被拒绝`;
      case "zh-Hant":
        return `被拒`;
      case "en-XA":
        return `[ŕéƒûšîñĝ ~~~]`;
      case "ar-XB":
        return `‮refusing‬`;
    }
    return `refusing`;
  }
  function settingsSubscriptionsRefusedHoldText() {
    switch (currentLanguage()) {
      case "ar":
        return `يُرفض تسجيل الدخول هذا.`;
      case "de":
        return `Diese Anmeldung wird abgelehnt.`;
      case "es":
        return `Este inicio de sesión está siendo rechazado.`;
      case "fr":
        return `Cette connexion est refusée.`;
      case "ja":
        return `このサインインは拒否されています。`;
      case "ko":
        return `이 로그인이 거부되고 있어요.`;
      case "pt-BR":
        return `Este login está sendo recusado.`;
      case "zh-Hans":
        return `这个登录正在被拒绝。`;
      case "zh-Hant":
        return `這個登入正在被拒絕。`;
      case "en-XA":
        return `[Ţĥîš šîĝñ-îñ îš ƀéîñĝ ŕéƒûšéð. ~~~~~~~~~~]`;
      case "ar-XB":
        return `‮This sign-in is being refused.‬`;
    }
    return `This sign-in is being refused.`;
  }
  function settingsSubscriptionsSavedResets(input) {
    const count = formatNumber(input.count);
    const site = input.site;
    switch (currentLanguage()) {
      case "ar":
        switch (pluralCategory(input.count)) {
          case "zero":
            return `إعادات تعيين محفوظة: ${count} · استخدم واحدة على ${site}`;
          case "one":
            return `إعادة تعيين محفوظة واحدة · استخدمها على ${site}`;
          case "two":
            return `إعادتا تعيين محفوظتان · استخدم واحدة على ${site}`;
          case "few":
            return `إعادات تعيين محفوظة: ${count} · استخدم واحدة على ${site}`;
          case "many":
            return `إعادات تعيين محفوظة: ${count} · استخدم واحدة على ${site}`;
          default:
            return `إعادات تعيين محفوظة: ${count} · استخدم واحدة على ${site}`;
        }
      case "de":
        switch (pluralCategory(input.count)) {
          case "one":
            return `${count} gespeicherter Reset · einlösbar auf ${site}`;
          default:
            return `${count} gespeicherte Resets · einlösbar auf ${site}`;
        }
      case "es":
        switch (pluralCategory(input.count)) {
          case "one":
            return `${count} restablecimiento guardado · úsalo en ${site}`;
          case "many":
            return `${count} restablecimientos guardados · usa uno en ${site}`;
          default:
            return `${count} restablecimientos guardados · usa uno en ${site}`;
        }
      case "fr":
        switch (pluralCategory(input.count)) {
          case "one":
            return `${count} réinitialisation enregistrée · à utiliser sur ${site}`;
          case "many":
            return `${count} réinitialisations enregistrées · à utiliser sur ${site}`;
          default:
            return `${count} réinitialisations enregistrées · à utiliser sur ${site}`;
        }
      case "ja":
        switch (pluralCategory(input.count)) {
          default:
            return `保存済みのリセット ${count} 回分 · ${site} で使用`;
        }
      case "ko":
        switch (pluralCategory(input.count)) {
          default:
            return `저장된 재설정 ${count}개 · ${site}에서 사용`;
        }
      case "pt-BR":
        switch (pluralCategory(input.count)) {
          case "one":
            return `${count} redefinição salva · use em ${site}`;
          case "many":
            return `${count} redefinições salvas · use uma em ${site}`;
          default:
            return `${count} redefinições salvas · use uma em ${site}`;
        }
      case "zh-Hans":
        switch (pluralCategory(input.count)) {
          default:
            return `${count} 次已保存的重置 · 在 ${site} 使用`;
        }
      case "zh-Hant":
        switch (pluralCategory(input.count)) {
          default:
            return `${count} 次已儲存的重設 · 在 ${site} 使用`;
        }
      case "en-XA":
        switch (pluralCategory(input.count, "en")) {
          case "one":
            return `[${count} šáṽéð ŕéšéţ · ûšé îţ öñ ${site} ~~~~~~~~~]`;
          default:
            return `[${count} šáṽéð ŕéšéţš · ûšé öñé öñ ${site} ~~~~~~~~~]`;
        }
      case "ar-XB":
        switch (pluralCategory(input.count, "en")) {
          case "one":
            return `${count}‮ saved reset · use it on ‬${site}`;
          default:
            return `${count}‮ saved resets · use one on ‬${site}`;
        }
    }
    switch (pluralCategory(input.count)) {
      case "one":
        return `${count} saved reset · use it on ${site}`;
      default:
        return `${count} saved resets · use one on ${site}`;
    }
  }
  function settingsSubscriptionsSignInAgainState() {
    switch (currentLanguage()) {
      case "ar":
        return `سجّل الدخول مجددًا.`;
      case "de":
        return `Melde dich erneut an.`;
      case "es":
        return `Vuelve a iniciar sesión.`;
      case "fr":
        return `Reconnectez-vous.`;
      case "ja":
        return `もう一度サインインしてください。`;
      case "ko":
        return `다시 로그인하세요.`;
      case "pt-BR":
        return `Faça login de novo.`;
      case "zh-Hans":
        return `请重新登录。`;
      case "zh-Hant":
        return `請重新登入。`;
      case "en-XA":
        return `[Šîĝñ îñ áĝáîñ. ~~~~~]`;
      case "ar-XB":
        return `‮Sign in again.‬`;
    }
    return `Sign in again.`;
  }
  function settingsSubscriptionsSignedIn() {
    switch (currentLanguage()) {
      case "ar":
        return `مسجّل الدخول`;
      case "de":
        return `angemeldet`;
      case "es":
        return `sesión iniciada`;
      case "fr":
        return `connecté`;
      case "ja":
        return `サインイン済み`;
      case "ko":
        return `로그인됨`;
      case "pt-BR":
        return `login feito`;
      case "zh-Hans":
        return `已登录`;
      case "zh-Hant":
        return `已登入`;
      case "en-XA":
        return `[šîĝñéð îñ ~~~]`;
      case "ar-XB":
        return `‮signed in‬`;
    }
    return `signed in`;
  }
  function settingsSubscriptionsSignedOutHoldLabel() {
    switch (currentLanguage()) {
      case "ar":
        return `معلّق`;
      case "de":
        return `angehalten`;
      case "es":
        return `en espera`;
      case "fr":
        return `en suspens`;
      case "ja":
        return `保留中`;
      case "ko":
        return `보류 중`;
      case "pt-BR":
        return `em espera`;
      case "zh-Hans":
        return `已暂停`;
      case "zh-Hant":
        return `已暫停`;
      case "en-XA":
        return `[öñ ĥöļð ~~~]`;
      case "ar-XB":
        return `‮on hold‬`;
    }
    return `on hold`;
  }
  function settingsSubscriptionsSignedOutHoldText() {
    switch (currentLanguage()) {
      case "ar":
        return `العمل متوقف مؤقتًا حتى تسجّل الدخول مجددًا.`;
      case "de":
        return `Die Arbeit ist pausiert, bis du dich erneut anmeldest.`;
      case "es":
        return `El trabajo está en pausa hasta que vuelvas a iniciar sesión.`;
      case "fr":
        return `Le travail est en pause jusqu’à ce que vous vous reconnectiez.`;
      case "ja":
        return `もう一度サインインするまで作業は一時停止します。`;
      case "ko":
        return `다시 로그인할 때까지 작업이 일시 정지돼요.`;
      case "pt-BR":
        return `O trabalho está pausado até você fazer login de novo.`;
      case "zh-Hans":
        return `工作已暂停，直到你重新登录。`;
      case "zh-Hant":
        return `工作已暫停，直到你重新登入。`;
      case "en-XA":
        return `[Ŵöŕķ îš þáûšéð ûñţîļ ýöû šîĝñ îñ áĝáîñ. ~~~~~~~~~~~~~]`;
      case "ar-XB":
        return `‮Work is paused until you sign in again.‬`;
    }
    return `Work is paused until you sign in again.`;
  }
  function settingsSubscriptionsStale() {
    switch (currentLanguage()) {
      case "ar":
        return `قديم`;
      case "de":
        return `veraltet`;
      case "es":
        return `desactualizada`;
      case "fr":
        return `pas à jour`;
      case "ja":
        return `古い情報`;
      case "ko":
        return `오래됨`;
      case "pt-BR":
        return `desatualizada`;
      case "zh-Hans":
        return `已过时`;
      case "zh-Hant":
        return `已過時`;
      case "en-XA":
        return `[šţáļé ~~]`;
      case "ar-XB":
        return `‮stale‬`;
    }
    return `stale`;
  }
  function settingsUsageDailyHeading() {
    switch (currentLanguage()) {
      case "ar":
        return `الاستخدام اليومي`;
      case "de":
        return `Tägliche Nutzung`;
      case "es":
        return `Uso diario`;
      case "fr":
        return `Utilisation quotidienne`;
      case "ja":
        return `日別の使用量`;
      case "ko":
        return `일별 사용량`;
      case "pt-BR":
        return `Uso diário`;
      case "zh-Hans":
        return `每日用量`;
      case "zh-Hant":
        return `每日用量`;
      case "en-XA":
        return `[Ðáîļý ûšáĝé ~~~~]`;
      case "ar-XB":
        return `‮Daily usage‬`;
    }
    return `Daily usage`;
  }
  function settingsUsageEmptyLead() {
    switch (currentLanguage()) {
      case "ar":
        return `يظهر الاستخدام بعد أن يُنهي نائب القبطان أو فرد من الطاقم ردًّا من نموذج.`;
      case "de":
        return `Die Nutzung erscheint, sobald dein erster Offizier oder ein Crewmitglied eine Modellantwort abschließt.`;
      case "es":
        return `El uso aparece cuando el primer oficial o un tripulante termina una respuesta de un modelo.`;
      case "fr":
        return `L’utilisation apparaît dès que le second ou un équipier termine une réponse d’un modèle.`;
      case "ja":
        return `一等航海士か乗組員がモデルの応答を1回終えると、使用量が表示されます。`;
      case "ko":
        return `일등항해사나 선원이 모델 응답을 하나 끝내면 사용량이 나타나요.`;
      case "pt-BR":
        return `O uso aparece depois que o imediato ou um tripulante termina uma resposta de um modelo.`;
      case "zh-Hans":
        return `大副或船员完成一次模型回复后，这里会显示用量。`;
      case "zh-Hant":
        return `大副或船員完成一次模型回應後，這裡就會顯示用量。`;
      case "en-XA":
        return `[Ûšáĝé áþþéáŕš áƒţéŕ ţĥé ƒîŕšţ ɱáţé öŕ á çŕéŵɱáţé ƒîñîšĥéš á ɱöðéļ ŕéšþöñšé. ~~~~~~~~~~~~~~~~~~~~~~~~~]`;
      case "ar-XB":
        return `‮Usage appears after the first mate or a crewmate finishes a model response.‬`;
    }
    return `Usage appears after the first mate or a crewmate finishes a model response.`;
  }
  function settingsUsageEmptyTitle() {
    switch (currentLanguage()) {
      case "ar":
        return `لا نشاط مسجّل`;
      case "de":
        return `Keine erfasste Aktivität`;
      case "es":
        return `Sin actividad registrada`;
      case "fr":
        return `Aucune activité enregistrée`;
      case "ja":
        return `記録されたアクティビティはありません`;
      case "ko":
        return `기록된 활동 없음`;
      case "pt-BR":
        return `Nenhuma atividade registrada`;
      case "zh-Hans":
        return `没有记录的活动`;
      case "zh-Hant":
        return `沒有記錄的活動`;
      case "en-XA":
        return `[Ñö ŕéçöŕðéð áçţîṽîţý ~~~~~~~]`;
      case "ar-XB":
        return `‮No recorded activity‬`;
    }
    return `No recorded activity`;
  }
  function settingsUsageKindChore() {
    switch (currentLanguage()) {
      case "ar":
        return `الصيانة`;
      case "de":
        return `Wartung`;
      case "es":
        return `Mantenimiento`;
      case "fr":
        return `Entretien`;
      case "ja":
        return `メンテナンス`;
      case "ko":
        return `유지 관리`;
      case "pt-BR":
        return `Manutenção`;
      case "zh-Hans":
        return `维护`;
      case "zh-Hant":
        return `維護`;
      case "en-XA":
        return `[Ṁáîñţéñáñçé ~~~~]`;
      case "ar-XB":
        return `‮Maintenance‬`;
    }
    return `Maintenance`;
  }
  function settingsUsageKindFix() {
    switch (currentLanguage()) {
      case "ar":
        return `الإصلاحات`;
      case "de":
        return `Korrekturen`;
      case "es":
        return `Correcciones`;
      case "fr":
        return `Corrections`;
      case "ja":
        return `修正`;
      case "ko":
        return `수정`;
      case "pt-BR":
        return `Correções`;
      case "zh-Hans":
        return `修复`;
      case "zh-Hant":
        return `修正`;
      case "en-XA":
        return `[Ƒîẋéš ~~]`;
      case "ar-XB":
        return `‮Fixes‬`;
    }
    return `Fixes`;
  }
  function settingsUsageKindImplement() {
    switch (currentLanguage()) {
      case "ar":
        return `التنفيذ`;
      case "de":
        return `Umsetzung`;
      case "es":
        return `Implementación`;
      case "fr":
        return `Réalisation`;
      case "ja":
        return `実装`;
      case "ko":
        return `구현`;
      case "pt-BR":
        return `Implementação`;
      case "zh-Hans":
        return `实现`;
      case "zh-Hant":
        return `實作`;
      case "en-XA":
        return `[Îɱþļéɱéñţáţîöñ ~~~~~]`;
      case "ar-XB":
        return `‮Implementation‬`;
    }
    return `Implementation`;
  }
  function settingsUsageKindOperation() {
    switch (currentLanguage()) {
      case "ar":
        return `العمليات`;
      case "de":
        return `Betrieb`;
      case "es":
        return `Operaciones`;
      case "fr":
        return `Opérations`;
      case "ja":
        return `運用`;
      case "ko":
        return `운영`;
      case "pt-BR":
        return `Operações`;
      case "zh-Hans":
        return `运维`;
      case "zh-Hant":
        return `維運`;
      case "en-XA":
        return `[Öþéŕáţîöñš ~~~~]`;
      case "ar-XB":
        return `‮Operations‬`;
    }
    return `Operations`;
  }
  function settingsUsageKindOther() {
    switch (currentLanguage()) {
      case "ar":
        return `عمل آخر للمهام`;
      case "de":
        return `Andere Aufgabenarbeit`;
      case "es":
        return `Otro trabajo de tareas`;
      case "fr":
        return `Autre travail des tâches`;
      case "ja":
        return `その他のタスク作業`;
      case "ko":
        return `기타 작업`;
      case "pt-BR":
        return `Outro trabalho de tarefas`;
      case "zh-Hans":
        return `其他任务工作`;
      case "zh-Hant":
        return `其他任務工作`;
      case "en-XA":
        return `[Öţĥéŕ ţášķ ŵöŕķ ~~~~~]`;
      case "ar-XB":
        return `‮Other task work‬`;
    }
    return `Other task work`;
  }
  function settingsUsageKindPlan() {
    switch (currentLanguage()) {
      case "ar":
        return `الخطط`;
      case "de":
        return `Pläne`;
      case "es":
        return `Planes`;
      case "fr":
        return `Plans`;
      case "ja":
        return `計画`;
      case "ko":
        return `계획`;
      case "pt-BR":
        return `Planos`;
      case "zh-Hans":
        return `计划`;
      case "zh-Hant":
        return `計畫`;
      case "en-XA":
        return `[Þļáñš ~~]`;
      case "ar-XB":
        return `‮Plans‬`;
    }
    return `Plans`;
  }
  function settingsUsageKindReproduce() {
    switch (currentLanguage()) {
      case "ar":
        return `إعادة إنتاج المشكلات`;
      case "de":
        return `Nachstellen von Problemen`;
      case "es":
        return `Reproducción de problemas`;
      case "fr":
        return `Reproduction de problèmes`;
      case "ja":
        return `問題の再現`;
      case "ko":
        return `문제 재현`;
      case "pt-BR":
        return `Reprodução de problemas`;
      case "zh-Hans":
        return `问题复现`;
      case "zh-Hant":
        return `問題重現`;
      case "en-XA":
        return `[Îššûé ŕéþŕöðûçţîöñ ~~~~~~]`;
      case "ar-XB":
        return `‮Issue reproduction‬`;
    }
    return `Issue reproduction`;
  }
  function settingsUsageKindResearch() {
    switch (currentLanguage()) {
      case "ar":
        return `البحث`;
      case "de":
        return `Recherche`;
      case "es":
        return `Investigación`;
      case "fr":
        return `Recherche`;
      case "ja":
        return `調査`;
      case "ko":
        return `조사`;
      case "pt-BR":
        return `Pesquisa`;
      case "zh-Hans":
        return `调研`;
      case "zh-Hant":
        return `研究`;
      case "en-XA":
        return `[Ŕéšéáŕçĥ ~~~]`;
      case "ar-XB":
        return `‮Research‬`;
    }
    return `Research`;
  }
  function settingsUsageKindRetrieval() {
    switch (currentLanguage()) {
      case "ar":
        return `الاستعلامات والشروح`;
      case "de":
        return `Nachschlagen und Erklärungen`;
      case "es":
        return `Consultas y explicaciones`;
      case "fr":
        return `Consultations et explications`;
      case "ja":
        return `調べものと説明`;
      case "ko":
        return `찾아보기와 설명`;
      case "pt-BR":
        return `Consultas e explicações`;
      case "zh-Hans":
        return `查询与解释`;
      case "zh-Hant":
        return `查詢與說明`;
      case "en-XA":
        return `[Ļööķûþš áñð éẋþļáñáţîöñš ~~~~~~~~]`;
      case "ar-XB":
        return `‮Lookups and explanations‬`;
    }
    return `Lookups and explanations`;
  }
  function settingsUsageKindReview() {
    switch (currentLanguage()) {
      case "ar":
        return `المراجعات`;
      case "de":
        return `Reviews`;
      case "es":
        return `Revisiones`;
      case "fr":
        return `Revues`;
      case "ja":
        return `レビュー`;
      case "ko":
        return `검토`;
      case "pt-BR":
        return `Revisões`;
      case "zh-Hans":
        return `审查`;
      case "zh-Hant":
        return `審查`;
      case "en-XA":
        return `[Ŕéṽîéŵš ~~~]`;
      case "ar-XB":
        return `‮Reviews‬`;
    }
    return `Reviews`;
  }
  function settingsUsageMilestoneFinished(input) {
    const count = input.count;
    switch (currentLanguage()) {
      case "ar":
        return `المهام المنتهية: ${count}`;
      case "de":
        return `${count} Aufgaben erledigt`;
      case "es":
        return `${count} tareas terminadas`;
      case "fr":
        return `${count} tâches terminées`;
      case "ja":
        return `${count}件のタスクが完了`;
      case "ko":
        return `작업 ${count}개 완료`;
      case "pt-BR":
        return `${count} tarefas concluídas`;
      case "zh-Hans":
        return `已完成 ${count} 个任务`;
      case "zh-Hant":
        return `已完成 ${count} 項任務`;
      case "en-XA":
        return `[${count} ţášķš ƒîñîšĥéð ~~~~~]`;
      case "ar-XB":
        return `${count}‮ tasks finished‬`;
    }
    return `${count} tasks finished`;
  }
  function settingsUsageMilestoneFinishedOne() {
    switch (currentLanguage()) {
      case "ar":
        return `انتهت مهمة واحدة`;
      case "de":
        return `1 Aufgabe erledigt`;
      case "es":
        return `1 tarea terminada`;
      case "fr":
        return `1 tâche terminée`;
      case "ja":
        return `1件のタスクが完了`;
      case "ko":
        return `작업 1개 완료`;
      case "pt-BR":
        return `1 tarefa concluída`;
      case "zh-Hans":
        return `已完成 1 个任务`;
      case "zh-Hant":
        return `已完成 1 項任務`;
      case "en-XA":
        return `[1 ţášķ ƒîñîšĥéð ~~~~~]`;
      case "ar-XB":
        return `‮1 task finished‬`;
    }
    return `1 task finished`;
  }
  function settingsUsageMilestoneFirst() {
    switch (currentLanguage()) {
      case "ar":
        return `أول إنجاز عند 1`;
      case "de":
        return `Erster Meilenstein bei 1`;
      case "es":
        return `Primer hito: 1`;
      case "fr":
        return `Premier palier à 1`;
      case "ja":
        return `最初の節目は1件`;
      case "ko":
        return `첫 이정표는 1개`;
      case "pt-BR":
        return `Primeiro marco em 1`;
      case "zh-Hans":
        return `第一个里程碑是 1`;
      case "zh-Hant":
        return `第一個里程碑是 1`;
      case "en-XA":
        return `[Ƒîŕšţ ɱîļéšţöñé áţ 1 ~~~~~~~]`;
      case "ar-XB":
        return `‮First milestone at 1‬`;
    }
    return `First milestone at 1`;
  }
  function settingsUsageMilestoneNext(input) {
    const count = input.count;
    switch (currentLanguage()) {
      case "ar":
        return `الإنجاز التالي عند ${count}`;
      case "de":
        return `Nächster Meilenstein bei ${count}`;
      case "es":
        return `Próximo hito: ${count}`;
      case "fr":
        return `Prochain palier à ${count}`;
      case "ja":
        return `次の節目は${count}件`;
      case "ko":
        return `다음 이정표는 ${count}개`;
      case "pt-BR":
        return `Próximo marco em ${count}`;
      case "zh-Hans":
        return `下一个里程碑是 ${count}`;
      case "zh-Hant":
        return `下一個里程碑是 ${count}`;
      case "en-XA":
        return `[Ñéẋţ ɱîļéšţöñé áţ ${count} ~~~~~~]`;
      case "ar-XB":
        return `‮Next milestone at ‬${count}`;
    }
    return `Next milestone at ${count}`;
  }
  function settingsUsageMilestoneNone() {
    switch (currentLanguage()) {
      case "ar":
        return `لم تنتهِ أي مهمة بعد`;
      case "de":
        return `Noch keine Aufgaben erledigt`;
      case "es":
        return `Todavía no hay tareas terminadas`;
      case "fr":
        return `Aucune tâche terminée pour l’instant`;
      case "ja":
        return `完了したタスクはまだありません`;
      case "ko":
        return `아직 완료된 작업 없음`;
      case "pt-BR":
        return `Nenhuma tarefa concluída ainda`;
      case "zh-Hans":
        return `还没有完成的任务`;
      case "zh-Hant":
        return `還沒有完成的任務`;
      case "en-XA":
        return `[Ñö ţášķš ƒîñîšĥéð ýéţ ~~~~~~~]`;
      case "ar-XB":
        return `‮No tasks finished yet‬`;
    }
    return `No tasks finished yet`;
  }
  function settingsUsageMilestoneNote() {
    switch (currentLanguage()) {
      case "ar":
        return `كل السجل المحفوظ. التقدم يأتي من العمل المنتهي، لا من مزيد من الرموز.`;
      case "de":
        return `Der gesamte aufbewahrte Verlauf. Fortschritt entsteht durch erledigte Arbeit, nicht durch mehr Tokens.`;
      case "es":
        return `Todo el historial guardado. El progreso viene del trabajo terminado, no de más tokens.`;
      case "fr":
        return `Tout l’historique conservé. La progression vient du travail terminé, pas de jetons supplémentaires.`;
      case "ja":
        return `保存されているすべての履歴です。進み具合は完了した作業で決まり、トークンの量では決まりません。`;
      case "ko":
        return `보관된 전체 기록이에요. 진행은 토큰을 더 쓰는 것이 아니라 완료한 작업에서 나와요.`;
      case "pt-BR":
        return `Todo o histórico guardado. O progresso vem do trabalho concluído, não de mais tokens.`;
      case "zh-Hans":
        return `全部保留的历史。进展来自完成的工作，而不是更多的 token。`;
      case "zh-Hant":
        return `所有保留的歷史。進度來自完成的工作，而不是更多 token。`;
      case "en-XA":
        return `[Åļļ ŕéţáîñéð ĥîšţöŕý. Þŕöĝŕéšš çöɱéš ƒŕöɱ ƒîñîšĥéð ŵöŕķ, ñöţ ɱöŕé ţöķéñš. ~~~~~~~~~~~~~~~~~~~~~~~~~]`;
      case "ar-XB":
        return `‮All retained history. Progress comes from finished work, not more tokens.‬`;
    }
    return `All retained history. Progress comes from finished work, not more tokens.`;
  }
  function settingsUsageMilestoneReached(input) {
    const count = input.count;
    switch (currentLanguage()) {
      case "ar":
        return `بلغت ${count}`;
      case "de":
        return `${count} erreicht`;
      case "es":
        return `Alcanzado: ${count}`;
      case "fr":
        return `Atteint : ${count}`;
      case "ja":
        return `${count}件に到達`;
      case "ko":
        return `${count}개 달성`;
      case "pt-BR":
        return `Alcançado: ${count}`;
      case "zh-Hans":
        return `已达到 ${count}`;
      case "zh-Hant":
        return `已達到 ${count}`;
      case "en-XA":
        return `[Ŕéáçĥéð ${count} ~~~]`;
      case "ar-XB":
        return `‮Reached ‬${count}`;
    }
    return `Reached ${count}`;
  }
  function settingsUsageMilestoneTitle(input) {
    const finished = input.finished;
    const where = input.where;
    switch (currentLanguage()) {
      case "ar":
        return `${finished} · ${where}`;
      case "de":
        return `${finished} · ${where}`;
      case "es":
        return `${finished} · ${where}`;
      case "fr":
        return `${finished} · ${where}`;
      case "ja":
        return `${finished} · ${where}`;
      case "ko":
        return `${finished} · ${where}`;
      case "pt-BR":
        return `${finished} · ${where}`;
      case "zh-Hans":
        return `${finished} · ${where}`;
      case "zh-Hant":
        return `${finished} · ${where}`;
      case "en-XA":
        return `[${finished} · ${where} ~]`;
      case "ar-XB":
        return `${finished}‮ · ‬${where}`;
    }
    return `${finished} · ${where}`;
  }
  function settingsUsageModelLineRecorded(input) {
    const provider = input.provider;
    switch (currentLanguage()) {
      case "ar":
        return `${provider} · نموذج مسجّل`;
      case "de":
        return `${provider} · Erfasstes Modell`;
      case "es":
        return `${provider} · Modelo registrado`;
      case "fr":
        return `${provider} · Modèle enregistré`;
      case "ja":
        return `${provider} · 記録されたモデル`;
      case "ko":
        return `${provider} · 기록된 모델`;
      case "pt-BR":
        return `${provider} · Modelo registrado`;
      case "zh-Hans":
        return `${provider} · 已记录的模型`;
      case "zh-Hant":
        return `${provider} · 已記錄的模型`;
      case "en-XA":
        return `[${provider} · Ŕéçöŕðéð ɱöðéļ ~~~~~~]`;
      case "ar-XB":
        return `${provider}‮ · Recorded model‬`;
    }
    return `${provider} · Recorded model`;
  }
  function settingsUsageModelNotRecorded() {
    switch (currentLanguage()) {
      case "ar":
        return `النموذج غير مسجّل`;
      case "de":
        return `Modell nicht erfasst`;
      case "es":
        return `Modelo no registrado`;
      case "fr":
        return `Modèle non enregistré`;
      case "ja":
        return `モデルの記録なし`;
      case "ko":
        return `모델이 기록되지 않음`;
      case "pt-BR":
        return `Modelo não registrado`;
      case "zh-Hans":
        return `未记录模型`;
      case "zh-Hant":
        return `未記錄模型`;
      case "en-XA":
        return `[Ṁöðéļ ñöţ ŕéçöŕðéð ~~~~~~]`;
      case "ar-XB":
        return `‮Model not recorded‬`;
    }
    return `Model not recorded`;
  }
  function settingsUsageModelsTokens() {
    switch (currentLanguage()) {
      case "ar":
        return `الرموز لكل نموذج`;
      case "de":
        return `Tokens pro Modell`;
      case "es":
        return `Tokens por modelo`;
      case "fr":
        return `Jetons par modèle`;
      case "ja":
        return `モデル別のトークン`;
      case "ko":
        return `모델별 토큰`;
      case "pt-BR":
        return `Tokens por modelo`;
      case "zh-Hans":
        return `每个模型的 token`;
      case "zh-Hant":
        return `每個模型的 token`;
      case "en-XA":
        return `[Ţöķéñš þéŕ ɱöðéļ ~~~~~~]`;
      case "ar-XB":
        return `‮Tokens per model‬`;
    }
    return `Tokens per model`;
  }
  function settingsUsageModelsUsd() {
    switch (currentLanguage()) {
      case "ar":
        return `الدولارات التقديرية لكل نموذج`;
      case "de":
        return `Geschätzte Dollar pro Modell`;
      case "es":
        return `Dólares estimados por modelo`;
      case "fr":
        return `Dollars estimés par modèle`;
      case "ja":
        return `モデル別の推定ドル`;
      case "ko":
        return `모델별 추정 달러`;
      case "pt-BR":
        return `Dólares estimados por modelo`;
      case "zh-Hans":
        return `每个模型的估算美元`;
      case "zh-Hant":
        return `每個模型的估計美元`;
      case "en-XA":
        return `[Éšţîɱáţéð ðöļļáŕš þéŕ ɱöðéļ ~~~~~~~~~]`;
      case "ar-XB":
        return `‮Estimated dollars per model‬`;
    }
    return `Estimated dollars per model`;
  }
  function settingsUsageNoActivity() {
    switch (currentLanguage()) {
      case "ar":
        return `لا نشاط`;
      case "de":
        return `Keine Aktivität`;
      case "es":
        return `Sin actividad`;
      case "fr":
        return `Aucune activité`;
      case "ja":
        return `アクティビティなし`;
      case "ko":
        return `활동 없음`;
      case "pt-BR":
        return `Sem atividade`;
      case "zh-Hans":
        return `没有活动`;
      case "zh-Hant":
        return `沒有活動`;
      case "en-XA":
        return `[Ñö áçţîṽîţý ~~~~]`;
      case "ar-XB":
        return `‮No activity‬`;
    }
    return `No activity`;
  }
  function settingsUsageNotAvailable() {
    switch (currentLanguage()) {
      case "ar":
        return `غير متاح`;
      case "de":
        return `Nicht verfügbar`;
      case "es":
        return `No disponible`;
      case "fr":
        return `Indisponible`;
      case "ja":
        return `利用できません`;
      case "ko":
        return `알 수 없음`;
      case "pt-BR":
        return `Indisponível`;
      case "zh-Hans":
        return `不可用`;
      case "zh-Hant":
        return `無法使用`;
      case "en-XA":
        return `[Ñöţ áṽáîļáƀļé ~~~~~]`;
      case "ar-XB":
        return `‮Not available‬`;
    }
    return `Not available`;
  }
  function settingsUsageNothingRecorded() {
    switch (currentLanguage()) {
      case "ar":
        return `لم يُسجَّل شيء بعد`;
      case "de":
        return `Noch nichts erfasst`;
      case "es":
        return `Todavía no hay nada registrado`;
      case "fr":
        return `Rien d’enregistré pour l’instant`;
      case "ja":
        return `まだ記録がありません`;
      case "ko":
        return `아직 기록된 것이 없음`;
      case "pt-BR":
        return `Nada registrado ainda`;
      case "zh-Hans":
        return `尚无记录`;
      case "zh-Hant":
        return `尚無紀錄`;
      case "en-XA":
        return `[Ñöţĥîñĝ ŕéçöŕðéð ýéţ ~~~~~~~]`;
      case "ar-XB":
        return `‮Nothing recorded yet‬`;
    }
    return `Nothing recorded yet`;
  }
  function settingsUsagePeriod30d() {
    switch (currentLanguage()) {
      case "ar":
        return `آخر 30 يومًا`;
      case "de":
        return `Letzte 30 Tage`;
      case "es":
        return `Últimos 30 días`;
      case "fr":
        return `30 derniers jours`;
      case "ja":
        return `過去30日間`;
      case "ko":
        return `지난 30일`;
      case "pt-BR":
        return `Últimos 30 dias`;
      case "zh-Hans":
        return `过去 30 天`;
      case "zh-Hant":
        return `過去 30 天`;
      case "en-XA":
        return `[Ļášţ 30 ðáýš ~~~~]`;
      case "ar-XB":
        return `‮Last 30 days‬`;
    }
    return `Last 30 days`;
  }
  function settingsUsagePeriod7d() {
    switch (currentLanguage()) {
      case "ar":
        return `آخر 7 أيام`;
      case "de":
        return `Letzte 7 Tage`;
      case "es":
        return `Últimos 7 días`;
      case "fr":
        return `7 derniers jours`;
      case "ja":
        return `過去7日間`;
      case "ko":
        return `지난 7일`;
      case "pt-BR":
        return `Últimos 7 dias`;
      case "zh-Hans":
        return `过去 7 天`;
      case "zh-Hant":
        return `過去 7 天`;
      case "en-XA":
        return `[Ļášţ 7 ðáýš ~~~~]`;
      case "ar-XB":
        return `‮Last 7 days‬`;
    }
    return `Last 7 days`;
  }
  function settingsUsagePeriodAll() {
    switch (currentLanguage()) {
      case "ar":
        return `كل المدة المسجّلة`;
      case "de":
        return `Gesamter erfasster Zeitraum`;
      case "es":
        return `Todo el tiempo registrado`;
      case "fr":
        return `Toute la période enregistrée`;
      case "ja":
        return `記録されたすべての期間`;
      case "ko":
        return `기록된 전체 기간`;
      case "pt-BR":
        return `Todo o período registrado`;
      case "zh-Hans":
        return `全部记录时间`;
      case "zh-Hant":
        return `所有紀錄期間`;
      case "en-XA":
        return `[Åļļ ŕéçöŕðéð ţîɱé ~~~~~~]`;
      case "ar-XB":
        return `‮All recorded time‬`;
    }
    return `All recorded time`;
  }
  function settingsUsagePeriodRange(input) {
    const first = input.first;
    const last = input.last;
    switch (currentLanguage()) {
      case "ar":
        return `${first}–${last} · بالتواريخ المحلية`;
      case "de":
        return `${first}–${last} · Lokale Daten`;
      case "es":
        return `${first}–${last} · Fechas locales`;
      case "fr":
        return `${first}–${last} · Dates locales`;
      case "ja":
        return `${first}–${last} · 現地の日付`;
      case "ko":
        return `${first}–${last} · 현지 날짜`;
      case "pt-BR":
        return `${first}–${last} · Datas locais`;
      case "zh-Hans":
        return `${first}–${last} · 本地日期`;
      case "zh-Hant":
        return `${first}–${last} · 當地日期`;
      case "en-XA":
        return `[${first}–${last} · Ļöçáļ ðáţéš ~~~~~]`;
      case "ar-XB":
        return `${first}‮–‬${last}‮ · Local dates‬`;
    }
    return `${first}–${last} · Local dates`;
  }
  function settingsUsagePeriodSince(input) {
    const date2 = input.date;
    switch (currentLanguage()) {
      case "ar":
        return `منذ ${date2} · بالتواريخ المحلية`;
      case "de":
        return `Seit ${date2} · Lokale Daten`;
      case "es":
        return `Desde ${date2} · Fechas locales`;
      case "fr":
        return `Depuis le ${date2} · Dates locales`;
      case "ja":
        return `${date2} 以降 · 現地の日付`;
      case "ko":
        return `${date2}부터 · 현지 날짜`;
      case "pt-BR":
        return `Desde ${date2} · Datas locais`;
      case "zh-Hans":
        return `自 ${date2} 起 · 本地日期`;
      case "zh-Hant":
        return `自 ${date2} 起 · 當地日期`;
      case "en-XA":
        return `[Šîñçé ${date2} · Ļöçáļ ðáţéš ~~~~~~~]`;
      case "ar-XB":
        return `‮Since ‬${date2}‮ · Local dates‬`;
    }
    return `Since ${date2} · Local dates`;
  }
  function settingsUsagePriced(input) {
    const priced = input.priced;
    const records = input.records;
    switch (currentLanguage()) {
      case "ar":
        return `${priced} من أصل ${records} سجل لها سعر`;
      case "de":
        return `${priced} von ${records} Einträgen mit Preis`;
      case "es":
        return `Registros con precio: ${priced} de ${records}`;
      case "fr":
        return `Entrées avec prix : ${priced} sur ${records}`;
      case "ja":
        return `${records}件の記録のうち${priced}件に価格あり`;
      case "ko":
        return `기록 ${records}개 중 ${priced}개에 가격 있음`;
      case "pt-BR":
        return `Registros com preço: ${priced} de ${records}`;
      case "zh-Hans":
        return `${records} 条记录中有 ${priced} 条已定价`;
      case "zh-Hant":
        return `${records} 筆紀錄中有 ${priced} 筆已計價`;
      case "en-XA":
        return `[${priced} öƒ ${records} ŕéçöŕðš þŕîçéð ~~~~~~~]`;
      case "ar-XB":
        return `${priced}‮ of ‬${records}‮ records priced‬`;
    }
    return `${priced} of ${records} records priced`;
  }
  function settingsUsageProjectUnavailable() {
    switch (currentLanguage()) {
      case "ar":
        return `المشروع غير متاح`;
      case "de":
        return `Projekt nicht verfügbar`;
      case "es":
        return `Proyecto no disponible`;
      case "fr":
        return `Projet indisponible`;
      case "ja":
        return `プロジェクトを利用できません`;
      case "ko":
        return `프로젝트를 알 수 없음`;
      case "pt-BR":
        return `Projeto indisponível`;
      case "zh-Hans":
        return `项目不可用`;
      case "zh-Hant":
        return `無法使用專案`;
      case "en-XA":
        return `[Þŕöĵéçţ ûñáṽáîļáƀļé ~~~~~~~]`;
      case "ar-XB":
        return `‮Project unavailable‬`;
    }
    return `Project unavailable`;
  }
  function settingsUsageProviderNotRecorded() {
    switch (currentLanguage()) {
      case "ar":
        return `المزوّد غير مسجّل`;
      case "de":
        return `Anbieter nicht erfasst`;
      case "es":
        return `Proveedor no registrado`;
      case "fr":
        return `Fournisseur non enregistré`;
      case "ja":
        return `プロバイダーの記録なし`;
      case "ko":
        return `제공자가 기록되지 않음`;
      case "pt-BR":
        return `Provedor não registrado`;
      case "zh-Hans":
        return `未记录服务商`;
      case "zh-Hant":
        return `未記錄供應商`;
      case "en-XA":
        return `[Þŕöṽîðéŕ ñöţ ŕéçöŕðéð ~~~~~~~]`;
      case "ar-XB":
        return `‮Provider not recorded‬`;
    }
    return `Provider not recorded`;
  }
  function settingsUsageReadoutEstimate() {
    switch (currentLanguage()) {
      case "ar":
        return `قيمة تقديرية · دولار`;
      case "de":
        return `Geschätzter Wert · USD`;
      case "es":
        return `Valor estimado · USD`;
      case "fr":
        return `Valeur estimée · USD`;
      case "ja":
        return `推定値 · 米ドル`;
      case "ko":
        return `추정 금액 · USD`;
      case "pt-BR":
        return `Valor estimado · USD`;
      case "zh-Hans":
        return `估算值 · 美元`;
      case "zh-Hant":
        return `估計值 · 美元`;
      case "en-XA":
        return `[Éšţîɱáţéð ṽáļûé · ÛŠÐ ~~~~~~~]`;
      case "ar-XB":
        return `‮Estimated value · USD‬`;
    }
    return `Estimated value · USD`;
  }
  function settingsUsageReadoutFinished() {
    switch (currentLanguage()) {
      case "ar":
        return `المهام المنتهية`;
      case "de":
        return `Erledigte Aufgaben`;
      case "es":
        return `Tareas terminadas`;
      case "fr":
        return `Tâches terminées`;
      case "ja":
        return `完了したタスク`;
      case "ko":
        return `완료된 작업`;
      case "pt-BR":
        return `Tarefas concluídas`;
      case "zh-Hans":
        return `已完成的任务`;
      case "zh-Hant":
        return `已完成的任務`;
      case "en-XA":
        return `[Ţášķš ƒîñîšĥéð ~~~~~]`;
      case "ar-XB":
        return `‮Tasks finished‬`;
    }
    return `Tasks finished`;
  }
  function settingsUsageReadoutFinishedNote() {
    switch (currentLanguage()) {
      case "ar":
        return `في هذه المدة وهذا العمل`;
      case "de":
        return `In diesem Zeitraum und dieser Arbeit`;
      case "es":
        return `En este período y trabajo`;
      case "fr":
        return `Sur cette période et ce travail`;
      case "ja":
        return `この期間と作業の範囲`;
      case "ko":
        return `이 기간과 작업 범위에서`;
      case "pt-BR":
        return `Neste período e trabalho`;
      case "zh-Hans":
        return `在此时段和工作范围内`;
      case "zh-Hant":
        return `在這段期間和工作範圍內`;
      case "en-XA":
        return `[Îñ ţĥîš þéŕîöð áñð ŵöŕķ ~~~~~~~~]`;
      case "ar-XB":
        return `‮In this period and work‬`;
    }
    return `In this period and work`;
  }
  function settingsUsageReadoutKnownEstimate() {
    switch (currentLanguage()) {
      case "ar":
        return `تقدير معروف · دولار`;
      case "de":
        return `Bekannte Schätzung · USD`;
      case "es":
        return `Estimación conocida · USD`;
      case "fr":
        return `Estimation connue · USD`;
      case "ja":
        return `判明している推定 · 米ドル`;
      case "ko":
        return `확인된 추정 · USD`;
      case "pt-BR":
        return `Estimativa conhecida · USD`;
      case "zh-Hans":
        return `已知估算 · 美元`;
      case "zh-Hant":
        return `已知估計 · 美元`;
      case "en-XA":
        return `[Ķñöŵñ éšţîɱáţé · ÛŠÐ ~~~~~~~]`;
      case "ar-XB":
        return `‮Known estimate · USD‬`;
    }
    return `Known estimate · USD`;
  }
  function settingsUsageReadoutModelsNote() {
    switch (currentLanguage()) {
      case "ar":
        return `عبر العمل المحدد`;
      case "de":
        return `Über die gewählte Arbeit hinweg`;
      case "es":
        return `En todo el trabajo seleccionado`;
      case "fr":
        return `Sur tout le travail sélectionné`;
      case "ja":
        return `選択した作業全体`;
      case "ko":
        return `선택한 작업 전체에서`;
      case "pt-BR":
        return `Em todo o trabalho selecionado`;
      case "zh-Hans":
        return `所选工作范围内`;
      case "zh-Hant":
        return `所選工作範圍內`;
      case "en-XA":
        return `[Åçŕöšš ţĥé šéļéçţéð ŵöŕķ ~~~~~~~~]`;
      case "ar-XB":
        return `‮Across the selected work‬`;
    }
    return `Across the selected work`;
  }
  function settingsUsageReadoutModelsUsed() {
    switch (currentLanguage()) {
      case "ar":
        return `النماذج المستخدمة`;
      case "de":
        return `Verwendete Modelle`;
      case "es":
        return `Modelos usados`;
      case "fr":
        return `Modèles utilisés`;
      case "ja":
        return `使用したモデル`;
      case "ko":
        return `사용한 모델`;
      case "pt-BR":
        return `Modelos usados`;
      case "zh-Hans":
        return `使用过的模型`;
      case "zh-Hant":
        return `使用過的模型`;
      case "en-XA":
        return `[Ṁöðéļš ûšéð ~~~~]`;
      case "ar-XB":
        return `‮Models used‬`;
    }
    return `Models used`;
  }
  function settingsUsageReadoutRecordedModels() {
    switch (currentLanguage()) {
      case "ar":
        return `النماذج المسجّلة`;
      case "de":
        return `Erfasste Modelle`;
      case "es":
        return `Modelos registrados`;
      case "fr":
        return `Modèles enregistrés`;
      case "ja":
        return `記録されたモデル`;
      case "ko":
        return `기록된 모델`;
      case "pt-BR":
        return `Modelos registrados`;
      case "zh-Hans":
        return `已记录的模型`;
      case "zh-Hant":
        return `已記錄的模型`;
      case "en-XA":
        return `[Ŕéçöŕðéð ɱöðéļš ~~~~~]`;
      case "ar-XB":
        return `‮Recorded models‬`;
    }
    return `Recorded models`;
  }
  function settingsUsageReadoutTokens() {
    switch (currentLanguage()) {
      case "ar":
        return `الرموز المسجّلة`;
      case "de":
        return `Erfasste Tokens`;
      case "es":
        return `Tokens registrados`;
      case "fr":
        return `Jetons enregistrés`;
      case "ja":
        return `記録されたトークン`;
      case "ko":
        return `기록된 토큰`;
      case "pt-BR":
        return `Tokens registrados`;
      case "zh-Hans":
        return `已记录的 token`;
      case "zh-Hant":
        return `已記錄的 token`;
      case "en-XA":
        return `[Ŕéçöŕðéð ţöķéñš ~~~~~]`;
      case "ar-XB":
        return `‮Recorded tokens‬`;
    }
    return `Recorded tokens`;
  }
  function settingsUsageReadoutTokensComplete() {
    switch (currentLanguage()) {
      case "ar":
        return `الإدخال والإخراج والذاكرة المؤقتة`;
      case "de":
        return `Eingabe, Ausgabe und Cache`;
      case "es":
        return `Entrada, salida y caché`;
      case "fr":
        return `Entrée, sortie et cache`;
      case "ja":
        return `入力、出力、キャッシュ`;
      case "ko":
        return `입력, 출력, 캐시`;
      case "pt-BR":
        return `Entrada, saída e cache`;
      case "zh-Hans":
        return `输入、输出和缓存`;
      case "zh-Hant":
        return `輸入、輸出和快取`;
      case "en-XA":
        return `[Îñþûţ, öûţþûţ áñð çáçĥé ~~~~~~~~]`;
      case "ar-XB":
        return `‮Input, output and cache‬`;
    }
    return `Input, output and cache`;
  }
  function settingsUsageReadoutTokensPartial() {
    switch (currentLanguage()) {
      case "ar":
        return `الفئات المُبلَّغ عنها فقط`;
      case "de":
        return `Nur gemeldete Kategorien`;
      case "es":
        return `Solo las categorías informadas`;
      case "fr":
        return `Catégories signalées uniquement`;
      case "ja":
        return `報告されたカテゴリのみ`;
      case "ko":
        return `보고된 항목만`;
      case "pt-BR":
        return `Só as categorias informadas`;
      case "zh-Hans":
        return `仅已报告的类别`;
      case "zh-Hant":
        return `僅限已回報的類別`;
      case "en-XA":
        return `[Ŕéþöŕţéð çáţéĝöŕîéš öñļý ~~~~~~~~]`;
      case "ar-XB":
        return `‮Reported categories only‬`;
    }
    return `Reported categories only`;
  }
  function settingsUsageScopeFirstmate() {
    switch (currentLanguage()) {
      case "ar":
        return `نائب القبطان`;
      case "de":
        return `Erster Offizier`;
      case "es":
        return `Primer oficial`;
      case "fr":
        return `Second`;
      case "ja":
        return `一等航海士`;
      case "ko":
        return `일등항해사`;
      case "pt-BR":
        return `Imediato`;
      case "zh-Hans":
        return `大副`;
      case "zh-Hant":
        return `大副`;
      case "en-XA":
        return `[Ƒîŕšţ ɱáţé ~~~~]`;
      case "ar-XB":
        return `‮First mate‬`;
    }
    return `First mate`;
  }
  function settingsUsageScopeOther() {
    switch (currentLanguage()) {
      case "ar":
        return `عمل آخر`;
      case "de":
        return `Andere Arbeit`;
      case "es":
        return `Otro trabajo`;
      case "fr":
        return `Autre travail`;
      case "ja":
        return `その他の作業`;
      case "ko":
        return `기타 작업`;
      case "pt-BR":
        return `Outro trabalho`;
      case "zh-Hans":
        return `其他工作`;
      case "zh-Hant":
        return `其他工作`;
      case "en-XA":
        return `[Öţĥéŕ ŵöŕķ ~~~~]`;
      case "ar-XB":
        return `‮Other work‬`;
    }
    return `Other work`;
  }
  function settingsUsageSummary(input) {
    const period = input.period;
    const tokens = input.tokens;
    switch (currentLanguage()) {
      case "ar":
        return `${tokens} رمز · ${period}`;
      case "de":
        return `${tokens} Tokens · ${period}`;
      case "es":
        return `${tokens} tokens · ${period}`;
      case "fr":
        return `${tokens} jetons · ${period}`;
      case "ja":
        return `${tokens} トークン · ${period}`;
      case "ko":
        return `${tokens} 토큰 · ${period}`;
      case "pt-BR":
        return `${tokens} tokens · ${period}`;
      case "zh-Hans":
        return `${tokens} token · ${period}`;
      case "zh-Hant":
        return `${tokens} token · ${period}`;
      case "en-XA":
        return `[${tokens} ţöķéñš · ${period} ~~~~]`;
      case "ar-XB":
        return `${tokens}‮ tokens · ‬${period}`;
    }
    return `${tokens} tokens · ${period}`;
  }
  function settingsUsageUnitTokens() {
    switch (currentLanguage()) {
      case "ar":
        return `رموز`;
      case "de":
        return `Tokens`;
      case "es":
        return `Tokens`;
      case "fr":
        return `Jetons`;
      case "ja":
        return `トークン`;
      case "ko":
        return `토큰`;
      case "pt-BR":
        return `Tokens`;
      case "zh-Hans":
        return `Token`;
      case "zh-Hant":
        return `Token`;
      case "en-XA":
        return `[Ţöķéñš ~~]`;
      case "ar-XB":
        return `‮Tokens‬`;
    }
    return `Tokens`;
  }
  function settingsUsageUnitUsd() {
    switch (currentLanguage()) {
      case "ar":
        return `$ تقديري`;
      case "de":
        return `Geschätzt $`;
      case "es":
        return `$ estimados`;
      case "fr":
        return `$ estimés`;
      case "ja":
        return `推定 $`;
      case "ko":
        return `추정 $`;
      case "pt-BR":
        return `$ estimados`;
      case "zh-Hans":
        return `估算 $`;
      case "zh-Hant":
        return `估計 $`;
      case "en-XA":
        return `[Éšţîɱáţéð $ ~~~~]`;
      case "ar-XB":
        return `‮Estimated $‬`;
    }
    return `Estimated $`;
  }
  function settingsUsageWhereHeading() {
    switch (currentLanguage()) {
      case "ar":
        return `أين ذهب`;
      case "de":
        return `Wofür es verwendet wurde`;
      case "es":
        return `A dónde fue`;
      case "fr":
        return `Où c’est allé`;
      case "ja":
        return `使われた先`;
      case "ko":
        return `어디에 쓰였는지`;
      case "pt-BR":
        return `Para onde foi`;
      case "zh-Hans":
        return `用在了哪里`;
      case "zh-Hant":
        return `用在哪裡`;
      case "en-XA":
        return `[Ŵĥéŕé îţ ŵéñţ ~~~~~]`;
      case "ar-XB":
        return `‮Where it went‬`;
    }
    return `Where it went`;
  }
  function settingsUsageWhereLegend() {
    switch (currentLanguage()) {
      case "ar":
        return `يشمل كل مجموع فرعي استدعاءات النماذج التي أُجريت لمهامه.`;
      case "de":
        return `Jede Zwischensumme enthält die Modellaufrufe für ihre Aufgaben.`;
      case "es":
        return `Cada subtotal incluye las llamadas a modelos hechas para sus tareas.`;
      case "fr":
        return `Chaque sous-total inclut les appels aux modèles faits pour ses tâches.`;
      case "ja":
        return `各小計には、そのタスクのために行ったモデルの呼び出しが含まれます。`;
      case "ko":
        return `각 소계에는 해당 작업을 위해 호출한 모델 사용량이 포함돼요.`;
      case "pt-BR":
        return `Cada subtotal inclui as chamadas de modelo feitas para as tarefas dele.`;
      case "zh-Hans":
        return `每个小计都包含为其任务发起的模型调用。`;
      case "zh-Hant":
        return `每個小計都包含為其任務發出的模型呼叫。`;
      case "en-XA":
        return `[Éáçĥ šûƀţöţáļ îñçļûðéš ţĥé ɱöðéļ çáļļš ɱáðé ƒöŕ îţš ţášķš. ~~~~~~~~~~~~~~~~~~~~]`;
      case "ar-XB":
        return `‮Each subtotal includes the model calls made for its tasks.‬`;
    }
    return `Each subtotal includes the model calls made for its tasks.`;
  }
  const AUTOMATION_STATE_WORDS = {
    draft: "Draft",
    enabled: "Running",
    paused: "Paused",
    completed: "Done"
  };
  const AUTOMATION_STATE_TONES = {
    draft: "ring",
    enabled: "ok",
    paused: "idle",
    completed: "ring"
  };
  function automationStateWords(rule) {
    return rule.failing ? automationStateFailing() : AUTOMATION_STATE_WORDS[rule.state];
  }
  function automationStateTone(rule) {
    return rule.failing ? "danger" : AUTOMATION_STATE_TONES[rule.state];
  }
  function automationLooksFailingWords(failing) {
    const since = formatDateTime(new Date(failing.since), {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    });
    return [
      automationLooksFailing({ since }),
      automationLooksFailingAnswer({ reason: failing.reason })
    ];
  }
  const WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const WEEKDAYS_PLURAL = [
    "Sundays",
    "Mondays",
    "Tuesdays",
    "Wednesdays",
    "Thursdays",
    "Fridays",
    "Saturdays"
  ];
  function hereZone$1() {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  }
  function automationClockWords(hour, minute) {
    return formatTime(new Date(2e3, 0, 1, hour, minute), {
      hour: "numeric",
      minute: "2-digit"
    });
  }
  function automationDaysWords(days) {
    const set = [...new Set(days)].sort((a, b) => a - b);
    if (set.length === 7) return "Every day";
    if (set.join() === "1,2,3,4,5") return "Weekdays";
    if (set.join() === "0,6") return "Weekends";
    if (set.length === 1) return WEEKDAYS_PLURAL[set[0] ?? 0] ?? "";
    return set.map((day) => WEEKDAYS_SHORT[day] ?? "").join(", ");
  }
  function automationZoneWords(zone) {
    const parts = zone.split("/");
    if (parts.length < 2) return zone.replaceAll("_", " ");
    const city = (parts.at(-1) ?? zone).replaceAll("_", " ");
    return `${city} (${parts.slice(0, -1).join("/").replaceAll("_", " ")})`;
  }
  function automationDateWords(ms, timeZone) {
    const elsewhere = timeZone !== void 0 && timeZone !== hereZone$1();
    return formatDateTime(ms, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      ...elsewhere ? { timeZone, timeZoneName: "short" } : {}
    });
  }
  function automationZoneOf(spec) {
    return spec.kind === "daily" || spec.kind === "weekly" ? spec.timeZone : void 0;
  }
  function automationEventWords(label, integration) {
    return `When ${label.charAt(0).toLowerCase()}${label.slice(1)} in ${integration}`;
  }
  const AUTOMATION_EVENT_UNKNOWN = "When something happens in an integration not connected now";
  function automationWhenWords(spec, when) {
    switch (spec.kind) {
      case "event":
        return when ?? AUTOMATION_EVENT_UNKNOWN;
      case "every":
        return spec.minutes % 60 === 0 ? spec.minutes === 60 ? "Every hour" : `Every ${spec.minutes / 60} hours` : `Every ${spec.minutes} minutes`;
      case "daily":
        return `Every day at ${automationClockWords(spec.hour, spec.minute)}`;
      case "weekly":
        return `${automationDaysWords(spec.days)} at ${automationClockWords(spec.hour, spec.minute)}`;
      case "once":
        return `Once, ${automationDateWords(spec.at)}`;
    }
  }
  function automationRuleTitle(rule) {
    return rule.name || cutText(rule.prompt, 48);
  }
  function automationNextWords(rule) {
    if (rule.state === "enabled" && rule.nextFire !== null) {
      return automationDateWords(rule.nextFire, automationZoneOf(rule.spec));
    }
    return automationStateWords(rule);
  }
  const AUTOMATION_UNREADABLE_SUMMARY = "cannot be read";
  function automationSummary(rules, unreadable = false) {
    const active = rules.filter((rule) => rule.state === "enabled").length;
    const paused = rules.filter((rule) => rule.state === "paused").length;
    return [
      `${active} active`,
      ...paused > 0 ? [`${paused} paused`] : [],
      ...unreadable ? [AUTOMATION_UNREADABLE_SUMMARY] : []
    ];
  }
  const COST_LIMIT_DEFAULT_USD = 50;
  const costLimitSchema = union([
    strictObject({ usd: number().positive().finite() }),
    strictObject({ none: literal(true) })
  ]);
  object({
    limit: costLimitSchema,
    recent: object({
      asked: number().int().nonnegative(),
      tasks: number().int().nonnegative(),
      days: number().int().positive()
    })
  });
  object({
    usd: number().nonnegative(),
    unpriced: number().int().nonnegative(),
    limit: costLimitSchema,
    source: _enum(["task", "project", "app"])
  });
  const saidTimeSchema = strictObject({ time: number() });
  const leafFillSchema = union([string(), number(), saidTimeSchema]);
  const saidPartSchema = strictObject({
    m: string(),
    a: record(string(), leafFillSchema).optional()
  });
  const saidSchema = strictObject({
    m: string(),
    a: record(string(), union([leafFillSchema, saidPartSchema])).optional()
  });
  function saidPart(m, ...args) {
    const [a] = args;
    return a && Object.keys(a).length ? { m, a } : { m };
  }
  array(strictObject({ text: string(), said: saidSchema }));
  const HERE = {
    this: "this computer",
    This: "This computer"
  };
  function hereAs(text, name) {
    return name === null ? text : text.replaceAll(HERE.This, name).replaceAll(HERE.this, name);
  }
  ({
    this: saidPart("placeThisComputer"),
    here: saidPart("placeHere")
  });
  const COMPUTER = {
    one: "computer"
  };
  const customNetworkModeSchema = _enum(["public", "private", "local"]);
  const customApiAnswerSchema = object({
    address: string().max(64),
    kind: _enum(["local", "private", "public", "reserved"])
  });
  const CUSTOM_API_REASON_MAX = 240;
  const customApiFailureCategorySchema = _enum([
    "address",
    "destination",
    "credential",
    "header",
    "redirect",
    "key-rejected",
    "access-refused",
    "not-found",
    "rate-limit",
    "server",
    "certificate",
    "network",
    "timeout",
    "stalled",
    "cancelled",
    "closed",
    "oversized",
    "malformed",
    "certificate-policy",
    "incompatible",
    "limits",
    "context-limit"
  ]);
  const customProtocolSchema = _enum([
    "openai-completions",
    "openai-responses",
    "anthropic-messages"
  ]);
  const customCacheRetentionSchema = _enum(["none", "short", "long"]);
  object({
    id: string(),
    label: string(),
    protocol: customProtocolSchema,
    cacheRetentions: array(customCacheRetentionSchema)
  });
  const customPriceSchema = number().finite().nonnegative().max(1e6);
  const customModelCostSchema = object({
    input: customPriceSchema.optional(),
    output: customPriceSchema.optional(),
    cacheRead: customPriceSchema.optional(),
    cacheWrite: customPriceSchema.optional()
  });
  const customCompactionSchema = object({
    keepRecentTokens: number().int().positive().max(1e8).optional(),
    reserveTokens: number().int().positive().max(1e8).optional()
  });
  const CUSTOM_THINKING_LEVELS = [
    "off",
    "minimal",
    "low",
    "medium",
    "high",
    "xhigh",
    "max"
  ];
  const customStatedReasoningSchema = object({
    thinkingLevelMap: partialRecord(_enum(CUSTOM_THINKING_LEVELS), string().max(64).nullable()).optional(),
    compat: record(string().max(64), union([boolean(), string().max(64)])).optional()
  });
  const customModelInputSchema = object({
    id: string().min(1).max(256),
    context: number().int().nonnegative(),
    output: number().int().nonnegative(),
    /** Absent on older connections: reasoning off and explicit caching off. */
    reasoningProfile: string().max(512).optional(),
    cacheRetention: customCacheRetentionSchema.optional(),
    /**
     * What the person calls the model and what it costs, both winning over the
     * catalog match. Neither is part of a model's check, so editing them never
     * checks it again.
     */
    name: string().trim().min(1).max(128).optional(),
    cost: customModelCostSchema.optional(),
    /**
     * What a connection file says the model reads. Absent (a typed line), the
     * check tries a picture; without `image`, it sends none and the model stays text-only.
     */
    input: array(_enum(["text", "image"])).max(2).optional(),
    /** A connection file's own reasoning for a model with no profile. */
    statedReasoning: customStatedReasoningSchema.optional(),
    /** Wins over the connection's, one value at a time. */
    compaction: customCompactionSchema.optional()
  });
  const customHeaderInputSchema = object({
    name: string().max(128),
    value: string().max(8192),
    secret: boolean()
  });
  const CUSTOM_API_MAX_HEADERS = 20;
  const customApiInputSchema = object({
    label: string().trim().min(1).max(64),
    baseUrl: string().max(4096),
    mode: customNetworkModeSchema,
    protocol: customProtocolSchema,
    /** The only secret-bearing request; never returned by any view. */
    key: string().max(8192),
    noKey: boolean(),
    /** Settings-approved shell command; only its stdout token stays in memory. */
    tokenCommand: object({ command: string().min(1), refreshSeconds: number().int().positive() }).optional(),
    /** Absent in connections saved before FI3-974. */
    headers: array(customHeaderInputSchema).max(CUSTOM_API_MAX_HEADERS).default([]),
    approvedDestination: string().max(4096),
    // Legacy field name retained for saved-data compatibility; approves HTTP in any mode.
    unencryptedLocalApproved: boolean(),
    certificates: object({ pem: string().max(65536), fingerprints: array(string()).max(8) }).optional(),
    allowStorageDefault: boolean(),
    storageApproved: boolean(),
    /** May be empty while a draft reads the server's model list; saving needs one. */
    models: array(customModelInputSchema).max(100),
    /** Same-address candidate only. A changed address creates a new connection. */
    replaceAccountId: string().optional(),
    /** Re-edit a private draft without returning its literal key to the UI. */
    sourceDraftId: string().optional(),
    /** Reuse the same connection's public CAs after fingerprint approval. */
    useExistingCertificates: boolean().optional(),
    /**
     * The canonical address the person made an exception for, after the form
     * told them what DNS answered: its name may then point to reserved or mixed
     * networks. Absent, the network check refuses those answers, as always.
     */
    addressException: string().max(4096).optional(),
    compaction: customCompactionSchema.optional(),
    /**
     * The provider's key in the connection file this connection was approved
     * from: its identity there, so the file's later edits reach it.
     */
    file: string().min(1).max(256).optional(),
    /**
     * The first mate's computer's connection this one was approved from on a
     * computer that runs work (its account id there), so that connection's
     * later edits reach it. A connection follows the file or the home, never both.
     */
    home: string().min(1).max(256).optional()
  });
  const customApiConnectInputSchema = customApiInputSchema.omit({ mode: true });
  const customListedModelSchema = object({
    id: string().min(1).max(256),
    context: number().int().positive().optional(),
    output: number().int().positive().optional(),
    /** The server says this model takes no chat turn; the form shows it unpickable. */
    notChat: literal(true).optional()
  });
  const customCertificateViewSchema = object({
    subject: string(),
    issuer: string(),
    fingerprint: string(),
    validFrom: string(),
    validTo: string()
  });
  object({
    destination: string(),
    certificates: array(customCertificateViewSchema),
    suggestion: string().optional()
  });
  const customApiViewSchema = object({
    draftId: string().optional(),
    accountId: string().optional(),
    label: string(),
    baseUrl: string(),
    mode: customNetworkModeSchema,
    protocol: customProtocolSchema,
    keyPresent: boolean(),
    tokenCommand: object({ command: string(), refreshSeconds: number().int().positive() }).optional(),
    tokenCommandFailed: boolean().optional(),
    noKey: boolean(),
    /** A secret header's value is never returned. */
    headers: array(object({ name: string(), secret: boolean(), value: string().optional() })).default([]),
    enabled: boolean(),
    allowStorageDefault: boolean(),
    /** The person made an exception for this address's DNS answers. */
    addressException: boolean().optional(),
    compaction: customCompactionSchema.optional(),
    /**
     * A connection approved from the connection file: its key there, and
     * whether the file still says what was approved here. `changed` (its
     * address, protocol or headers) and `missing` hold it until approved again.
     */
    file: object({ name: string(), state: _enum(["current", "changed", "missing"]) }).optional(),
    /**
     * A connection approved from the first mate's computer's own, on a computer
     * that runs work: its account id there, and whether what that computer
     * last sent still says what was approved here, as `file` says.
     */
    home: object({ name: string(), state: _enum(["current", "changed", "missing"]) }).optional(),
    certificates: array(customCertificateViewSchema),
    models: array(
      customModelInputSchema.extend({
        checked: boolean(),
        readsPictures: boolean().optional(),
        state: _enum([
          "untested",
          "checking",
          "checked",
          "unreachable",
          "key-rejected",
          "incompatible"
        ]),
        failure: string().optional(),
        /** Why the last check failed, for the form to place at the row or field at fault. */
        category: customApiFailureCategorySchema.optional(),
        /** The HTTP status the server answered the check with, when it answered with one. */
        status: number().int().optional(),
        /** A refusal's own reason: a short excerpt the transport cut and checked for echoed secrets. */
        reason: string().max(CUSTOM_API_REASON_MAX + 1).optional()
      })
    )
  });
  const customApiFailureSchema = object({
    category: customApiFailureCategorySchema,
    /** A base address to offer instead, when the one entered ends in an operation. */
    suggestion: string().optional(),
    /** `address`: the address, key or form was refused; `list`: the server's model list failed. */
    stage: _enum(["address", "list"])
  });
  object({
    view: customApiViewSchema.optional(),
    listed: array(customListedModelSchema).optional(),
    failure: customApiFailureSchema.optional()
  });
  object({
    destination: string().optional(),
    network: customNetworkModeSchema.optional(),
    suggestion: string().optional(),
    failure: customApiFailureCategorySchema.optional(),
    /** `destination`: what DNS answered for the name, each with the network it points to. */
    answers: array(customApiAnswerSchema).optional(),
    /** `destination`: the person may make an exception for this address. */
    exceptionOffered: boolean().optional()
  });
  function isCustomApiProvider(provider) {
    return /^fm-custom-[a-f0-9]{16}$/.test(provider);
  }
  const providerViewSchema = object({
    id: string(),
    name: string(),
    /**
     * Catalog placement. `key` is an API-key sign-in. `escape_hatch` remains
     * so an older view still parses; nothing in the catalog uses it, and the
     * chip labels both as "API key".
     */
    tier: _enum(["subscription", "key", "escape_hatch"]),
    /** Auth methods Pi offers for this provider. */
    authTypes: array(_enum(["oauth", "api_key"])),
    /**
     * Why there is no way in right now, when the provider's backend has a
     * sentence for it and `authTypes` is empty: `note` is the short line on the
     * chip, `detail` the sentence behind it. A Claude account runs the Claude
     * Code the person installed (F14), so a Mac without it says so here.
     */
    unavailable: object({ note: string(), detail: string() }).optional(),
    connected: boolean(),
    activeAuthType: _enum(["oauth", "api_key"]).optional(),
    billedPerToken: boolean()
  });
  const authPromptSchema = object({
    promptId: string(),
    providerId: string(),
    /** Which account row this prompt belongs to, when a login is account-scoped. */
    accountId: string().optional(),
    kind: _enum(["text", "secret", "select", "manual_code"]),
    message: string(),
    placeholder: string().optional(),
    options: array(object({ id: string(), label: string(), description: string().optional() })).optional()
  });
  const authNoticeSchema = object({
    providerId: string(),
    /** Which account row this notice belongs to, when a login is account-scoped. */
    accountId: string().optional(),
    kind: _enum(["info", "auth_url", "device_code", "progress"]),
    message: string(),
    url: string().optional(),
    userCode: string().optional(),
    /**
     * When a device code stops working, in epoch milliseconds, from the
     * provider's own answer (`expires_in`): the code step says the code
     * expired once a sign-in ends past it.
     */
    expiresAt: number().optional()
  });
  _enum(["pi", "claude"]);
  const CLAUDE_PROVIDER_ID = "anthropic-claude";
  const BEDROCK_PROVIDER_ID = "amazon-bedrock";
  const OPENCODE_GO_PROVIDER_ID = "opencode-go";
  const BEDROCK_PROFILE_UNAVAILABLE = "bedrock_profile_unavailable";
  const PROVIDER_CATALOG = [
    {
      id: "openai-codex",
      name: "Codex",
      tier: "subscription",
      backend: "pi",
      roles: ["firstmate", "crewmate"]
    },
    {
      id: "xai",
      name: "Grok",
      tier: "subscription",
      backend: "pi",
      roles: ["firstmate", "crewmate"]
    },
    {
      id: CLAUDE_PROVIDER_ID,
      name: "Claude",
      tier: "subscription",
      backend: "claude",
      roles: ["firstmate", "crewmate"]
    },
    {
      // Pi offers a device code or a pasted Kimi Code key; the chip starts
      // the code (INF-838).
      id: "kimi-coding",
      name: "Kimi Code",
      tier: "subscription",
      backend: "pi",
      roles: ["firstmate", "crewmate"],
      codeSignIn: { site: "Kimi" }
    },
    {
      // Pi's Copilot sign-in presents itself to GitHub as VS Code's Copilot
      // Chat: the client id and editor headers are fixed inside Pi's provider,
      // outside its login options. The captain chose to proceed through Pi
      // knowing this (INF-560, 2026-10-19), and later chose a chip with no
      // note and a code step that says GitHub asks to approve a Copilot app
      // (INF-838, 2026-10-22).
      id: "github-copilot",
      name: "Copilot",
      tier: "subscription",
      backend: "pi",
      roles: ["firstmate", "crewmate"],
      codeSignIn: { site: "GitHub", enterprise: true }
    },
    {
      // Pi's own provider: a pasted OpenCode key, the only way in (INF-6873).
      id: OPENCODE_GO_PROVIDER_ID,
      name: "OpenCode Go",
      // i18n-exempt: a product's own name
      tier: "subscription",
      backend: "pi",
      roles: ["firstmate", "crewmate"],
      keySignIn: { site: "OpenCode Console" }
      // i18n-exempt: a product's own page name
    },
    {
      id: "openrouter",
      name: "OpenRouter",
      tier: "key",
      backend: "pi",
      roles: ["firstmate", "crewmate"]
    },
    {
      id: BEDROCK_PROVIDER_ID,
      name: "Amazon Bedrock",
      tier: "key",
      backend: "pi",
      roles: ["firstmate", "crewmate"]
    }
  ];
  const API_KEY_LABEL = "API key";
  function catalogEntry(id) {
    return PROVIDER_CATALOG.find((entry) => entry.id === id);
  }
  const CHANGE_REQUEST_KINDS = ["github", "gitlab", "bitbucket"];
  const CHANGE_REQUEST_HOSTS = {
    github: {
      kind: "github",
      publicHost: "github.com",
      serverIntegration: "github-enterprise",
      serverIdPrefix: "ghe",
      publicHostIsServerRow: false,
      changeWord: "pull request",
      handle: "pr",
      numberPrefix: "#",
      requestPath: "pull",
      requestPaths: ["pull", "pulls"],
      comparePath: "compare",
      foldsNames: true,
      quickActions: false,
      holdsOnlyKnownHosts: false,
      addressExample: "github.example.com",
      // The same `repo workflow read:org` the code asks for on github.com.
      keyPage: (host) => `https://${host}/settings/tokens/new?scopes=repo,workflow,read:org&description=Infinitary`,
      batches: true
    },
    gitlab: {
      kind: "gitlab",
      publicHost: "gitlab.com",
      serverIntegration: "gitlab",
      serverIdPrefix: "gitlab",
      publicHostIsServerRow: true,
      changeWord: "merge request",
      handle: "mr",
      numberPrefix: "!",
      requestPath: "-/merge_requests",
      requestPaths: ["-/merge_requests"],
      comparePath: "-/compare",
      foldsNames: false,
      draftTitlePrefix: "Draft: ",
      quickActions: true,
      holdsOnlyKnownHosts: true,
      addressExample: "gitlab.com",
      keyPage: (host) => `https://${host}/-/user_settings/personal_access_tokens?name=Infinitary&scopes=api`,
      batches: true
    },
    /**
     * Bitbucket Cloud (`docs/forge.md`, "Bitbucket pull requests"): an API
     * token the person makes on their Atlassian account with Bitbucket's
     * scopes, sent as a bearer token; its pull requests are `#N` under
     * `pull-requests/`. The scopes are the ones the app reads and writes
     * with once the crew's reach is built too, so one key serves them all.
     */
    bitbucket: {
      kind: "bitbucket",
      publicHost: "bitbucket.org",
      serverIntegration: "bitbucket",
      serverIdPrefix: "bitbucket",
      publicHostIsServerRow: true,
      changeWord: "pull request",
      handle: "pr",
      numberPrefix: "#",
      requestPath: "pull-requests",
      requestPaths: ["pull-requests"],
      comparePath: "branches/compare",
      // Bitbucket names the branch first, then the branch it builds on, split by a carriage return.
      compareRange: (base, branch) => `${branch}%0D${base}`,
      // Bitbucket's workspace and repository names are lower case in every address.
      foldsNames: true,
      quickActions: false,
      holdsOnlyKnownHosts: true,
      addressExample: "bitbucket.org",
      // Atlassian keeps every Cloud API token on the person's account, not on
      // bitbucket.org; a Data Center server keeps its HTTP access tokens itself.
      keyPage: (host) => host === "bitbucket.org" ? "https://id.atlassian.com/manage-profile/security/api-tokens" : `https://${host}/plugins/servlet/access-tokens/manage`,
      keyAccount: "your Atlassian account",
      keyScopes: [
        "read:user:bitbucket",
        "read:workspace:bitbucket",
        "read:repository:bitbucket",
        "write:repository:bitbucket",
        "read:pullrequest:bitbucket",
        "write:pullrequest:bitbucket",
        "read:pipeline:bitbucket",
        "write:pipeline:bitbucket"
      ],
      batches: true,
      // Bitbucket Data Center on the person's own server: its own pages and
      // its own REST API (`docs/forge.md`, "Bitbucket Data Center").
      server: {
        projectPage: bitbucketServerProjectPage,
        comparePage: (base, branch) => `compare/commits?sourceBranch=${encodeURIComponent(`refs/heads/${branch}`)}&targetBranch=${encodeURIComponent(`refs/heads/${base}`)}`,
        batches: true,
        api: "bitbucket-data-center"
      }
    }
  };
  function bitbucketServerProjectPage(owner, name) {
    const segments = owner.split("/").filter(Boolean);
    const key = (segments[0]?.toLowerCase() === "scm" ? segments.slice(1) : segments).join("/");
    const slug = encodeURIComponent(name.toLowerCase());
    if (key.startsWith("~"))
      return `users/${encodeURIComponent(key.slice(1).toLowerCase())}/repos/${slug}`;
    return `projects/${encodeURIComponent(key.toUpperCase())}/repos/${slug}`;
  }
  function changeRequestKind(kind) {
    return CHANGE_REQUEST_KINDS.find((entry) => entry === kind);
  }
  function changeRequestHost(kind) {
    const known = changeRequestKind(kind);
    return known ? CHANGE_REQUEST_HOSTS[known] : void 0;
  }
  function serverFactsAt(kind, host) {
    const facts = changeRequestHost(kind);
    return facts && host && host !== facts.publicHost ? facts.server : void 0;
  }
  function hasChangeRequests(kind) {
    return changeRequestKind(kind) !== void 0;
  }
  const advisoryWorkflowSchema = string().trim().regex(/^\.github\/workflows\/[^/\s]+\.ya?ml$/, {
    // i18n-exempt: served to the first mate's model; Settings shows its own words
    message: "name a workflow file directly in .github/workflows, such as .github/workflows/early-tests.yml"
  });
  const advisoryWorkflowsSchema = array(advisoryWorkflowSchema).refine((paths) => new Set(paths).size === paths.length, {
    // i18n-exempt: served to the first mate's model; Settings shows its own words
    message: "name each advisory workflow once"
  });
  const batchChangeSchema = object({
    taskId: string(),
    branch: string(),
    /** The approved version of the branch. */
    head: string(),
    /** The change's checked title: its commit's subject in a batch. */
    title: string(),
    /** The commit's body: the story's What changed and any breaking footer. */
    body: string(),
    /** When it was approved (epoch ms): the line's order. */
    at: number(),
    /** Its own pull request, where it has one; closed with a link once the batch merges. */
    number: number().int().positive().optional(),
    /**
     * The branch its own pull request targets, when that is not the default
     * branch: a change stacked on another. It joins a batch only once that
     * branch's work is already in, so a batch never carries unapproved work.
     */
    base: string().optional(),
    /**
     * The task whose approved version this change was built on, while that
     * task had not merged (docs/task-graph.md, "A part that starts at
     * approval"); `base` names its pushed branch. The change waits in line,
     * never left out, until that task's work is merged or ahead of it.
     */
    after: string().optional(),
    /** Declared the held batch's fix: it joins that batch and ends the hold. */
    fix: literal(true).optional(),
    /**
     * The held batch version a fix was built on, once its approval or a combine
     * verified it: the fix is carried as its own difference from it from then
     * on, and is left out, never carried whole, when its branch no longer builds
     * on it.
     */
    heldBase: string().optional(),
    /**
     * The open batch's version this change was rebuilt on while that batch
     * ran (docs/forge.md, "A change rebuilt on an open batch"), and the
     * changes, by task and approved version, that version carries. It goes
     * right behind those changes, carried as its own difference from `head`,
     * and is left out, never carried whole, once any of them is neither ahead
     * of it at that version nor merged at it.
     */
    onBatch: object({
      head: string(),
      members: array(object({ taskId: string(), head: string() }))
    }).optional()
  });
  const batchMemberSchema = batchChangeSchema.extend({ commit: string() });
  const batchHoldSchema = object({
    at: number(),
    /** The batch's version the hold is about. */
    head: string(),
    reason: _enum(["checks", "merge-way", "rules"]),
    /** The failed checks' names, as the host reads them. */
    checks: array(string()),
    /** The host's own words for a merge it refused. */
    detail: string().optional(),
    /**
     * The checks of the held version that were cancelled, skipped or still
     * unfinished when last read: none of them ran to an end on its changes.
     * Absent where it is not known: the reading was incomplete, the batch is
     * held for something other than its checks, or the hold was kept before
     * it was recorded.
     */
    notRun: array(string()).optional()
  });
  const openBatchSchema = object({
    /** Approved repository address when this batch branch was first pushed. */
    origin: string().nullable().optional(),
    /** The batch branch the app owns. */
    branch: string(),
    /** Its version: the last member's commit, or the generated commit on top of it (`generated`). */
    head: string(),
    /** The default branch's commit it was combined onto. */
    base: string(),
    /** Absent until the host confirmed the pull request. */
    number: number().int().positive().optional(),
    url: string().nullable().optional(),
    /** Empty once every member was withdrawn: the pull request is then closed. */
    members: array(batchMemberSchema),
    since: number(),
    hold: batchHoldSchema.optional(),
    /**
     * The version the host's own merge queue took (docs/forge.md, "The host's
     * merge queue"): its place there is read, and nothing is sent again.
     */
    queued: string().optional(),
    /**
     * The version a merge was sent at whose outcome the host did not confirm,
     * on a host whose merge names no version (docs/forge.md, "Batches of your
     * own"): later passes read how it ended and never send it again.
     * `mergeTask` is the host's own reference to that merge, when it gave one.
     * `pending` is when a pass first read the host's merge as still running:
     * from then Settings → Projects shows the wait with Try again, and the
     * Activity feed said so once. No time decides that the merge ended.
     */
    unconfirmed: object({ head: string(), mergeTask: string().optional(), pending: number().optional() }).optional(),
    /** Its members, or the words of one, changed since it was pushed: the next pass combines it again. */
    stale: literal(true).optional(),
    /**
     * The repair whose declaration sent changes back beside its own fix: the
     * batch stays held at its version until that task's change is approved,
     * even once every member has left. Empty once that task closed first: the
     * batch stays held until another declared fix is approved or Try again.
     */
    awaits: string().optional(),
    /**
     * Its repair's judgment that the held version passed on a rerun of its
     * failed checks, such as the project's own rerun of the failed tests: at
     * `head`, the failed checks named in `checks` are answered, and the batch
     * merges once every other check passed. A fix declared meanwhile goes to
     * the next batch. A combine at a new version drops it.
     */
    passed: object({ head: string(), checks: array(string()) }).optional(),
    /** How many times it was held, counted at each fresh hold; absent before its first. */
    holds: number().int().positive().optional(),
    /**
     * The task repairing its hold, by id (docs/forge.md, "A held batch"): the
     * one task the first mate started with the `repairs_batch` mark, or the
     * last task whose `check_change` batch declaration answered the hold. Kept
     * while that task is open and the batch is, through a combine on the same
     * pull request, so a later hold names it; the app judges nothing from it.
     */
    repair: string().optional(),
    /**
     * The version the project's own checks added on top of the members'
     * commits, changing only files the project marks generated, as the app
     * wrote it again under its own push (docs/forge.md, "A generated commit"):
     * then `head`. Taken once per combine; the next combine starts without it.
     */
    generated: string().optional(),
    /**
     * The batch's own checks run early on a held batch's declared fix
     * (docs/forge.md, "A held batch"): once the fix's story is confirmed on
     * its own branch at `version`, built on the newest held version, the held
     * members plus the fix's own difference are combined at `head` and pushed
     * to the batch's branch and pull request, while `head` and `members` above
     * stay the held version. The fix is no member until approved; approved at
     * `version` with the checks at `head` passed, the batch merges `head` as it
     * is. `failed` names the checks that failed there.
     */
    trial: object({
      /** The fix's task, whose story was confirmed. */
      task: string(),
      /** The fix's confirmed version on its own branch. */
      version: string(),
      head: string(),
      base: string(),
      /** The held members, then the fix, each with its commit at `head`. */
      members: array(batchMemberSchema),
      at: number(),
      /** The checks that failed at `head` as last read; gone once they read otherwise. */
      failed: array(string()).optional(),
      /**
       * The commit of generated files the project's checks added on the run, written again
       * on it and pushed: `head` then names it (docs/forge.md, "A generated commit").
       */
      generated: string().optional()
    }).optional()
  });
  const batchReceiptSchema = object({
    taskId: string(),
    head: string(),
    sha: string().optional(),
    /** The batch's pull request. */
    number: number().int().positive(),
    url: string().nullable().optional(),
    at: number()
  });
  const batchSendBackSchema = object({
    taskId: string(),
    head: string(),
    reason: string(),
    at: number(),
    number: number().int().positive().optional(),
    url: string().nullable().optional(),
    failed: array(string()),
    /**
     * The batch's checks that were cancelled, skipped or unfinished there;
     * absent where its hold kept no such list, so they are not known.
     */
    notRun: array(string()).optional()
  });
  const batchLeftOutSchema = object({
    taskId: string(),
    head: string(),
    reason: string(),
    at: number(),
    /**
     * The task of the approved change ahead of it in the batch that it clashes
     * with, where it still combines with the default branch alone: nothing can
     * be done until that change merges or leaves the batch. Absent when it
     * clashes with the default branch itself.
     */
    ahead: string().optional(),
    /**
     * The open batch's version its crewmate was told to rebuild it on, and
     * that batch's branch: while that batch is open nothing else is asked,
     * since the rebuilt version goes in line behind it.
     */
    rebuild: object({ head: string(), branch: string() }).optional()
  });
  const mergeWaysSchema = object({
    squash: boolean(),
    rebase: boolean(),
    merge: boolean()
  });
  const finishedBatchSchema = object({
    number: number().int().positive(),
    url: string().nullable().optional(),
    /** When it was first opened (epoch ms). */
    formed: number(),
    ended: number(),
    outcome: _enum(["merged", "closed"]),
    members: array(object({ taskId: string(), title: string() })),
    /** How many times it was held while it was open. */
    holds: number().int().nonnegative()
  });
  const batchRebuildSchema = object({
    taskId: string(),
    /** The change's version that clashed with the batch. */
    head: string(),
    /** The open batch's version it was told to rebuild on, and that batch's branch. */
    on: string(),
    branch: string(),
    members: array(object({ taskId: string(), head: string() })),
    at: number(),
    /**
     * That batch merged carrying each of `members` at its version: the rebuild
     * stands, so the clashing version stays out of later batches and its merge
     * waits for the rebuilt version, until the task closes.
     */
    merged: literal(true).optional()
  });
  const batchRecordSchema = object({
    line: array(batchChangeSchema),
    open: openBatchSchema.optional(),
    receipts: array(batchReceiptSchema),
    leftOut: array(batchLeftOutSchema),
    /** The merges the project allows, as last read where it lives. */
    ways: mergeWaysSchema.optional(),
    /** Tasks whose change a repair declared the held batch's fix. */
    fixes: array(string()).optional(),
    /** Every send-back of an open task's change, oldest first (`BatchSendBack`). */
    sentBack: array(batchSendBackSchema).optional(),
    /**
     * Every version of the project's batch that held, newest first, kept
     * while a declared fix is outstanding and otherwise until a batch merges
     * or ends, through each combine and a batch closed and put back in line:
     * a declared fix built on one of them
     * combines as its own difference from that version, so it can change what
     * members wrote, and never carries a change sent back.
     */
    held: array(string()).optional(),
    /**
     * The held version each declared fix was verified to build on, by task,
     * kept with its repair, not with the change in line or in the batch, until
     * a batch merges with the fix or its task closes: every later version of
     * the fix is carried from it, or left out when it no longer builds on it.
     */
    fixBases: record(string(), string()).optional(),
    /**
     * The exact commit each declared fix's task had committed as it declared
     * it, by task, kept as long as the declaration: another task's change
     * approved at that commit, and no other, carries the same declaration.
     */
    fixHeads: record(string(), string()).optional(),
    /**
     * When the project's last batch formed from the line (epoch ms): a
     * project's batch gap counts from it (`batchGap` on the project). A held
     * batch combined again by its repair forms no new batch, so it moves nothing.
     */
    formed: number().optional(),
    /** The batches that ended within `FINISHED_BATCH_KEPT_MS`, oldest first. */
    finished: array(finishedBatchSchema).optional(),
    /**
     * The last open batch version each task's crewmate was told to rebuild
     * its change on (docs/forge.md, "A change rebuilt on an open batch"), at
     * the version that clashed, with the changes that batch version carries:
     * the crewmate hears once per clashing version and set of changes, and a
     * repair declared on that version goes in line as built on them. Kept
     * until the task closes.
     */
    rebuilds: array(batchRebuildSchema).optional()
  });
  discriminatedUnion("action", [
    object({ action: literal("try-again"), head: string().min(1) }),
    object({
      action: literal("send-back"),
      head: string().min(1),
      changes: array(
        object({
          taskId: string().min(1),
          reason: string().trim().min(1)
        })
      ).min(1)
    })
  ]);
  object({
    fix: boolean().optional(),
    sendBack: array(object({ task: string(), reason: string() })).optional(),
    /**
     * The held version, a full commit id, when a rerun passed its failed
     * checks: it merges at that version once its other checks pass, and a
     * fix declared beside it or meanwhile goes to the next batch.
     */
    passed: string().optional(),
    evidence: string()
  });
  const batchChecksReadingSchema = object({
    /** The batch's version the reading is of. */
    head: string(),
    /** When the pass read it (epoch ms). */
    at: number(),
    passed: number().int().nonnegative(),
    failed: number().int().nonnegative(),
    /** Checks that are queued or running. */
    running: number().int().nonnegative(),
    /** The failed checks' names, as the host reads them. */
    failedNames: array(string())
  });
  const batchTaskSchema = object({
    taskId: string(),
    key: string().nullable(),
    title: string()
  });
  object({
    repos: array(
      object({
        repoId: string(),
        name: string(),
        /** The project the repository belongs to, which the window's project focus names. */
        projectId: string().nullable(),
        /** Where the project lives, in the host's own name (GitHub), or null when unknown. */
        place: string().nullable(),
        /** The project's batch gap in minutes, or null for none. */
        gap: number().nullable(),
        /** When the next batch may form under the gap (epoch ms), or null for at once. */
        nextBatchAt: number().nullable(),
        line: array(
          batchTaskSchema.extend({
            at: number(),
            /** The task whose approved change it waits on, by key. */
            afterKey: string().nullable(),
            /** Declared the held batch's fix. */
            fix: boolean()
          })
        ),
        open: object({
          number: number().int().positive().nullable(),
          url: string().nullable(),
          since: number(),
          members: array(batchTaskSchema),
          hold: object({
            reason: _enum(["checks", "merge-way", "rules"]),
            at: number(),
            checks: array(string()),
            detail: string().nullable()
          }).nullable(),
          /** In the host's own merge queue at its version. */
          queued: boolean(),
          /** Its members changed: the next pass combines it again. */
          stale: boolean(),
          /** The declared fixes for its hold, by key. */
          fixKeys: array(string()),
          /** Its checks as last read at its version; null before the first reading. */
          checks: batchChecksReadingSchema.nullable(),
          /**
           * The task repairing its hold (`OpenBatch.repair`), or a held batch of
           * one's own change, whose crewmate repairs it; null with neither.
           * `own` marks that change's own crewmate, `fixing` a repair that
           * declared its change the hold's fix.
           */
          repair: batchTaskSchema.extend({ own: boolean(), fixing: boolean() }).nullable(),
          /** It waits for its repair's fix after changes were sent back (`OpenBatch.awaits`). */
          awaitsFix: boolean(),
          /** Its repair declared that a rerun passed the failed checks at its version. */
          passed: boolean(),
          /** The declared fix its checks run with before approval (`OpenBatch.trial`), until they fail. */
          checkingFix: batchTaskSchema.nullable()
        }).nullable(),
        leftOut: array(
          batchTaskSchema.extend({
            reason: string(),
            /** The change ahead it clashes with, by key. */
            aheadKey: string().nullable()
          })
        ),
        finished: array(
          finishedBatchSchema.omit({ members: true, url: true }).extend({
            url: string().nullable(),
            members: array(batchTaskSchema)
          })
        )
      })
    )
  });
  const contributionProjectSchema = strictObject({
    id: number().int().positive(),
    fullName: string().min(1),
    origin: string().url()
  });
  const contributionDestinationSchema = _enum(["upstream", "fork"]);
  const contributionRouteSchema = strictObject({
    upstream: contributionProjectSchema,
    fork: contributionProjectSchema.nullable(),
    /** An imported owned fork waits for the person's choice, never a host guess. */
    destination: contributionDestinationSchema.nullable(),
    /** Written before a create request; an uncertain request is never sent twice. */
    creationAttempted: boolean().optional()
  });
  strictObject({
    number: number().int().positive(),
    state: _enum(["open", "merged", "closed"]),
    updatedAt: string().optional()
  });
  const contributorDisclosureSchema = string().trim().max(300);
  const appFollowStepSchema = _enum(["getting", "waiting", "restarting", "cannot", "failed"]);
  const appFollowReasonSchema = _enum([
    "package-manager",
    "own-window",
    "installation",
    "unpublished"
  ]);
  const appFollowReportSchema = strictObject({
    version: string().min(1).max(64),
    step: appFollowStepSchema,
    percent: number().min(0).max(100).optional(),
    reason: appFollowReasonSchema.optional(),
    /** The app's own words for what stopped it, said after the home's. */
    problem: string().min(1).max(400).optional(),
    /**
     * On `waiting`: the row's Update was pressed, so it waits only for the
     * words typed there to be sent, not for nobody to use the app.
     */
    pressed: literal(true).optional()
  });
  strictObject({ deviceId: string().min(1).max(64) });
  object({
    /** The commit the build was made from: a release's source index's, or a source run's. */
    commit: string().regex(/^[a-f0-9]{40,64}$/).optional(),
    /** True for a run from source: absent for an installed release. */
    source: literal(true).optional()
  });
  const commandEndingSchema = _enum([
    "quit",
    "signal",
    "updated",
    "restart",
    "start-failed",
    "crashed",
    "not-answering"
  ]);
  const commandNoticeSchema = strictObject({
    /**
     * `waiting` while its start entry is expected to start it again, or, on
     * `not-answering`, while Start it here waits for that run to stop;
     * `stopped` once Start it here is offered.
     */
    state: _enum(["waiting", "stopped"]),
    ending: commandEndingSchema,
    /**
     * Set when this window started the program itself (docs/run.md, "The
     * window starts it"): the person never ran a command, so the line speaks
     * of their first mate, and Start it here starts that program again.
     */
    byWindow: literal(true).optional(),
    /**
     * Set on `not-answering` when the notice names no run that does not
     * answer: its door named none, or another run holds the folder now.
     * Start it here then stops nothing, and the app starting again connects
     * to whichever run is there; the line says so.
     */
    retries: literal(true).optional()
  });
  const updateChannelSchema = _enum(["stable", "alpha"]);
  const updateWorkSchema = object({
    state: _enum(["saving", "resuming"]),
    /**
     * Saving: each task whose running work the update waits for, by its
     * title. Resuming: each task whose work has not started again.
     */
    tasks: array(string())
  });
  object({
    currentVersion: string(),
    /** The subscription the status was read for. */
    channel: updateChannelSchema,
    latestVersion: string().nullable(),
    updateAvailable: boolean(),
    releaseUrl: string().nullable(),
    /**
     * The command that installs the offered version by hand, shown selectable
     * in the panel: the installed channel's cask upgrade on a Mac, the package
     * manager's on Arch or NixOS, or the system installer's when installing
     * from the app could not finish. Empty when there is none.
     */
    upgradeCommand: string(),
    /**
     * Present when the app installs the offered version itself (a deb, an rpm
     * or an AppImage on Linux; docs/alpha.md "Updates on Linux").
     */
    install: object({
      /** The system asks for the person's password before it installs. */
      asksPassword: boolean(),
      /** A Mac update downloads, verifies and restarts only after consent. */
      restarts: boolean().optional()
    }).optional(),
    /** The local app owns a persistent choice, independently of the installed version. */
    channelChoice: boolean().optional(),
    phase: _enum(["idle", "checking", "downloading", "installing", "ready", "error"]).optional(),
    percent: number().min(0).max(100).optional(),
    problem: string().optional(),
    notice: string().optional(),
    /**
     * When the release source last answered a check, in milliseconds since the
     * epoch: the up-to-date line says how long ago (docs/alpha.md "Update
     * channels"). Absent before a first answer, and from an older core.
     */
    checkedAt: number().optional(),
    /** The crew's work around this update, while there is any to save or resume. */
    work: updateWorkSchema.optional(),
    /**
     * A copy run from source by `pnpm dev`'s starter (docs/alpha.md, "Updates
     * from source"): the branch it follows where the project lives, how many
     * commits that branch has that this copy lacks, and, when it has some,
     * why the copy cannot move forward to them. Its versions are short
     * commits. Absent for an installed copy, and from an older core.
     */
    source: object({
      branch: string(),
      behind: number().int().min(0),
      held: _enum(["edited", "ahead"]).optional()
    }).optional(),
    /**
     * The paired phone or Mac, by its name, that started the update under way
     * (`home-update.md`): the notice says so, beside Update later.
     */
    askedFrom: string().optional()
  });
  union([
    object({ ok: literal(true) }),
    object({
      ok: literal(false),
      /** What happened and what to do, in the panel's own words. */
      problem: string(),
      /**
       * The person chose Update later while work was saved: nothing went
       * wrong, the update waits and the work carries on.
       */
      later: literal(true).optional()
    })
  ]);
  object({
    startAtLogin: boolean(),
    showInDock: boolean()
  });
  const workSetupReasonSchema = _enum([
    "other-home",
    "other-entry",
    "removal-unfinished",
    "app-place",
    "background-off",
    "no-background",
    "newer-work",
    "local-network",
    "not-reached"
  ]);
  strictObject({
    state: _enum(["running", "starting", "blocked"]),
    reason: workSetupReasonSchema.optional(),
    copyGone: literal(true).optional()
  });
  const deviceWorkSetupSchema = strictObject({
    state: _enum(["starting", "blocked"]),
    reason: workSetupReasonSchema.optional()
  });
  strictObject({ deviceId: string().min(1).max(64) });
  const deviceKindSchema = _enum(["mac", "work", "view"]);
  _enum(["view", "work"]);
  const deviceSystemSchema = _enum(["macos", "linux", "windows", "ios"]);
  const deviceChipSchema = _enum(["arm64", "x64"]);
  const PAIRING_LINK_PREFIX = "infinitary://join?";
  const KEY_TEXT_PATTERN = /^[A-Za-z0-9_-]{43}$/;
  const keyTextSchema = string().regex(KEY_TEXT_PATTERN);
  const deviceNameSchema = string().trim().min(1).max(64).regex(/^[^\p{Cc}\p{Cf}\p{Zl}\p{Zp}]+$/u);
  const hostLabel = "[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?";
  const HOST_NAME = new RegExp(`^(?=.{1,253}$)${hostLabel}(?:\\.${hostLabel})*$`, "i");
  const IPV6 = /^[0-9a-f:.]{2,45}$/i;
  const dialAddressSchema = string().refine((text) => splitDialAddress(text) !== null, {
    message: "Expected host:port"
  });
  function splitDialAddress(text) {
    const match = /^(?:\[([^\]]+)\]|([^:[\]]+)):(\d{1,5})$/.exec(text);
    if (!match) return null;
    const [, v6, name, portText] = match;
    const port = Number(portText);
    if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
    if (v6 !== void 0) return IPV6.test(v6) && v6.includes(":") ? { host: v6, port } : null;
    return name !== void 0 && HOST_NAME.test(name) ? { host: name, port } : null;
  }
  const homeViaSchema = literal("ssh");
  const PAIRING_LINK_ALSO_MAX = 8;
  strictObject({
    /** The kind the home made the link for. */
    kind: deviceKindSchema,
    /** Where to dial, unless `via` says the device reaches the home another way. */
    at: dialAddressSchema,
    /** The home's pin: SHA-256 of its public key, base64url. */
    key: keyTextSchema,
    /** The one-use code. */
    code: keyTextSchema,
    /** How the device reaches the home; absent, at `at`. */
    via: homeViaSchema.optional(),
    /**
     * The other addresses to try, after `at`, when the first does not answer.
     * One optional part, so a link without it reads as before.
     */
    also: array(dialAddressSchema).max(PAIRING_LINK_ALSO_MAX).optional()
  });
  const deviceUserNameSchema = string().min(1).max(64).regex(/^[A-Za-z0-9_](?:[A-Za-z0-9_.@ -]*[A-Za-z0-9_.@-])?$/);
  const deviceRemovalStageSchema = _enum(["when-back", "bringing-work", "cleaning-up"]);
  strictObject({
    into: string().min(1).max(64),
    cert: string().min(1).max(8192),
    signature: string().regex(/^[A-Za-z0-9_-]+$/).max(512)
  });
  _enum(["when-back", "now"]);
  const foundToolsSchema = strictObject({
    git: boolean(),
    claudeCode: boolean()
  });
  const deviceUpdateBySchema = _enum(["remote-login", "connection", "command"]);
  const deviceOtherVersionSchema = strictObject({
    app: string().min(1).max(64).optional(),
    than: _enum(["older", "newer"]).optional(),
    takesWork: boolean(),
    updateBy: deviceUpdateBySchema,
    downloads: literal(true).optional(),
    /**
     * This computer runs source at a commit, and Match builds that commit there
     * (docs/devices.md, "Matching the home's build"); absent when Match brings
     * it to this computer's installed version.
     */
    source: strictObject({ commit: string().regex(/^[a-f0-9]{40,64}$/) }).optional()
  });
  const deviceAppVersionSchema = strictObject({
    app: string().min(1).max(64).optional(),
    than: _enum(["older", "newer"]).optional(),
    same: literal(true).optional(),
    /**
     * Where that app stands in catching up with this computer's version, as
     * it last told it (docs/view.md, "Following the home's version";
     * `app-follows-home`): absent while it said nothing for this version.
     */
    follow: appFollowReportSchema.optional()
  });
  const sshStopReasonSchema = _enum([
    "host-unknown",
    "host-changed",
    "key-refused",
    "key-locked",
    "agent-declined",
    "agent-not-running",
    "forwarding-refused",
    "not-set-up",
    "other-home"
  ]);
  const automaticStartupSchema = _enum([
    "available",
    "at-login",
    "failed",
    "unavailable",
    "unknown"
  ]);
  const deviceSshSchema = strictObject({
    state: _enum(["connected", "connecting", "reconnecting", "at-login", "not-started", "stopped"]),
    reason: sshStopReasonSchema.optional(),
    automaticStartup: automaticStartupSchema.optional()
  });
  const computerReachSchema = _enum([
    "in-reach",
    "connecting",
    "reconnecting",
    "out-of-reach"
  ]);
  function awayWord(connecting, updating) {
    if (updating) return devicesAwayUpdating();
    return connecting ? "connecting" : "out of reach";
  }
  const deviceViewSchema = strictObject({
    id: string().min(1).max(64),
    kind: deviceKindSchema,
    name: deviceNameSchema,
    /** When it joined, in milliseconds since the epoch. */
    pairedAt: number().int().nonnegative(),
    /**
     * The macOS user a computer that runs work runs as, as it said when it
     * joined; absent for a view.
     */
    user: deviceUserNameSchema.optional(),
    automaticStartup: automaticStartupSchema.optional(),
    /**
     * Whether it joined from this Mac itself - another macOS user here, or a
     * second app on this Mac - as the home saw where it dialed from. Absent on
     * a device that joined before the home recorded it.
     */
    onThisMac: boolean().optional(),
    /**
     * The address its person added it at over Remote Login, such as
     * `sam@mini.local` (docs/devices.md, "Adding a computer by its address"): the
     * home updates Firstmate there, and removes what it set up there, the same
     * way. Absent on a device added by a link or a command.
     */
    remoteLogin: string().min(1).max(255).optional(),
    /** A verified address used only for an Ubuntu package update, not for pairing. */
    packageUpdateAt: string().min(1).max(255).optional(),
    /**
     * The system it runs and its chip, as its last hello said them
     * (docs/devices.md, "What a device is"); absent on a device that has not
     * said them since the home began keeping them.
     */
    system: deviceSystemSchema.optional(),
    chip: deviceChipSchema.optional(),
    // What the home reads of each device right now, for Settings -> Devices
    // (docs/devices.md, "Your devices"); never saved in the list.
    /** It is in reach: a computer that runs work takes work, a Mac that controls this Firstmate is connected. */
    inReach: boolean().optional(),
    /**
     * Connected now on another version of Firstmate than this Mac's, whether
     * or not it takes work; absent while it runs this Mac's version, and while
     * it is out of reach, when the home cannot tell.
     */
    otherVersion: deviceOtherVersionSchema.optional(),
    /**
     * The version of Infinitary its work runs, while connected on this
     * computer's version; one on another version says it in `otherVersion`.
     */
    workVersion: string().min(1).max(64).optional(),
    /**
     * The Infinitary app open on it now, while it controls this computer:
     * its version, and how it compares with this computer's. Absent while no
     * app is open there, when this computer cannot tell.
     */
    appVersion: deviceAppVersionSchema.optional(),
    /** When it was last in reach, in milliseconds since the epoch. */
    seenAt: number().int().nonnegative().optional(),
    /**
     * When the connection the row calls connected began, in milliseconds
     * since the epoch. Absent while it is not connected. A "could not reach"
     * line goes when this is newer than the line (protocol 8.17).
     */
    connectedAt: number().int().nonnegative().optional(),
    /** Firstmate is open on it, controlling this Firstmate now. */
    controlling: boolean().optional(),
    /** Another user on this Mac, out of reach since this Mac restarted: nobody has logged in as it since. */
    restartedSince: boolean().optional(),
    /**
     * What its crew's work is doing around its update (docs/devices.md,
     * "Saving work before an update"): `saving` before anything there stops,
     * naming the tasks it waits for, while Update later can let the update
     * go; `resuming` after it, until each turn it stopped has started again.
     */
    updateWork: updateWorkSchema.optional(),
    /**
     * The home follows its update now (docs/devices.md, "Updating"): from its
     * crew's pause until the update ends, while it was heard from in the last
     * `UPDATE_RETURN_MS`. Every place that names it says updating rather than
     * out of reach. A view that does not list `computer-updating` is sent the
     * list without it.
     */
    updating: literal(true).optional(),
    /**
     * Out of reach, and this Mac's address changed since it was last in
     * reach: it still looks for this Mac where it found it then, until it
     * hears where this Mac is now (docs/devices.md, "Finding the home again").
     */
    addressChanged: boolean().optional(),
    /**
     * Out of reach, never in reach since it joined from another Mac, and it
     * dials this Mac itself on the local network, where macOS there holds its
     * work's dial until someone at that Mac allows it; adding it by its
     * address reaches it over this Mac's own SSH instead (docs/devices.md,
     * "Held on the local network").
     */
    heldOnLocalNetwork: boolean().optional(),
    /**
     * Where it last reached this computer, from what pairing keeps: on this
     * network, or on the private network. Absent when it has not, or it
     * reached this computer itself.
     */
    reachedOn: _enum(["local", "private"]).optional(),
    /** How many tasks run there now. */
    tasks: number().int().nonnegative().optional(),
    /** The projects whose Runs on names it. */
    runs: array(string()).optional(),
    /**
     * Where this Mac's own SSH connection to it stands, for a computer added
     * by its address (docs/devices.md, "Through the home's SSH"); absent for
     * every other device, and while this Mac keeps no such connection.
     */
    ssh: deviceSshSchema.optional(),
    /**
     * Where its removal stands: waiting until it is back, bringing its
     * unmerged work here, then taking it off the list so it removes what
     * Firstmate set up there.
     */
    removal: deviceRemovalStageSchema.optional(),
    /**
     * A computer that runs work, joined again under a new key (docs/devices.md,
     * "Joined again"): the ids of earlier entries that run work, are out of
     * reach, have its name and user, joined before it, and still hold tasks
     * or projects. A fact the home states; only the captain's click acts on it.
     */
    earlier: array(string().min(1).max(64)).max(16).optional(),
    /**
     * Out of reach with started tasks that can move: how many the home can
     * carry on to another computer (`inf:devices:carry-on`). An independent
     * review follows its builder, so it is not counted; Remove now stops it.
     * Absent from a home without that change.
     */
    carriesOn: number().int().positive().optional(),
    /**
     * Its tasks are being carried on to this computer, by id
     * (`RUNS_ON_THIS_MAC` for the home), until it is removed.
     */
    carrying: string().min(1).max(64).optional(),
    /**
     * A Mac whose window is connected while its work is not in reach: whether
     * its work is being set up, or why it is not running or has not reached
     * this computer (`work-setup`, docs/devices.md, "A Mac that has not
     * finished setting up"). Absent otherwise, and for a Mac whose window has
     * not said.
     */
    workSetup: deviceWorkSetupSchema.optional()
  });
  strictObject({
    moving: number().int().nonnegative(),
    stayed: array(string().min(1).max(2e3)).max(500)
  });
  deviceViewSchema.pick({
    id: true,
    name: true,
    inReach: true
  });
  const deviceCommandForSchema = _enum(["another-mac", "another-user"]);
  strictObject({
    kind: deviceKindSchema,
    /** A phone link prefers detected private-network addresses, retaining local fallbacks. */
    phone: literal(true).optional(),
    /**
     * Where the link tells the device to dial; when absent, the private
     * address in use, or loopback for another user on this Mac or a Mac with none.
     */
    at: dialAddressSchema.optional(),
    /**
     * Wrap the link in the command for one: `another-mac` for kind `mac`,
     * `another-user` for kind `work`, which only a command adds.
     */
    command: deviceCommandForSchema.optional()
  });
  strictObject({
    /** The link's own handle, which Stop it names; not a secret, and not the link. */
    id: string().min(1).max(64),
    link: string().startsWith(PAIRING_LINK_PREFIX),
    kind: deviceKindSchema,
    expiresAt: number().int().nonnegative(),
    /**
     * The command that carries the link, when one was asked for: as secret as
     * the link. Its length is bounded by the longest word Linux lets a program
     * take (MAX_ARG_STRLEN, 128 KiB), so each word of a command within it can run.
     */
    command: strictObject({ for: deviceCommandForSchema, text: string().min(1).max(131072) }).optional()
  });
  const deviceAddressNetworkSchema = _enum(["local", "private"]);
  const deviceFirewallSchema = strictObject({
    name: _enum(["ufw", "firewalld", "nixos"]),
    port: number().int().min(1).max(65535)
  });
  const windowsFirewallSchema = strictObject({
    name: literal("windows"),
    port: number().int().min(1).max(65535),
    program: string().min(1).max(1024),
    profiles: array(_enum(["domain", "private", "public"])).min(1).max(3),
    blockRule: boolean(),
    blockAll: boolean()
  });
  strictObject({
    addresses: array(
      strictObject({ address: string().min(1).max(64), network: deviceAddressNetworkSchema })
    ),
    chosen: string().min(1).max(64).nullable(),
    current: string().min(1).max(64).nullable(),
    /** This computer's name on the local network, such as `kuns-macbook-pro.local`, when it has one. */
    name: string().min(1).max(253).optional(),
    firewall: deviceFirewallSchema.optional(),
    /** On a Windows home, its firewall that may keep devices out; absent when none is known to. */
    windowsFirewall: windowsFirewallSchema.optional(),
    /**
     * False on a home that cannot set a computer up by its address (a Windows
     * PC): + A computer offers the link and the command instead of the address
     * form. Absent where it can.
     */
    addsByAddress: literal(false).optional()
  });
  strictObject({
    /** The address that answered last, dialed first. */
    at: dialAddressSchema,
    /**
     * The home's other addresses, tried after `at` (docs/devices.md, "Finding
     * the home again"): the link's other addresses, then each welcome's list,
     * as many as a link carries. Absent on one that reaches its home only
     * through the home's SSH. Never saved in the grant's own file, which an
     * older version must still read: `JoinedHome` keeps them beside it.
     */
    also: array(dialAddressSchema).max(PAIRING_LINK_ALSO_MAX).optional(),
    /** The home's pin. */
    homeKey: keyTextSchema,
    deviceId: string().min(1).max(64),
    kind: deviceKindSchema,
    /** The device's own private key, PKCS#8 PEM. */
    key: string().min(1).max(8192),
    /** The device's own self-signed certificate, PEM. */
    cert: string().min(1).max(8192),
    /** How it reaches its home; absent, at `at`. */
    via: homeViaSchema.optional(),
    /**
     * For a computer that runs work: whether it runs on its home's own Mac, as
     * the home found where it joined from (`onThisMac` on the home's list) and
     * says in each welcome (docs/helper.md, "In the background"). Absent until
     * the home has said it.
     */
    onHomeMac: boolean().optional()
  });
  const leftReasonSchema = _enum(["left", "removed"]);
  const viewContactSchema = _enum(["reaching", "in-reach", "lost", "closed"]);
  const takeOverOfferSchema = strictObject({
    copyAt: number().int().nonnegative(),
    goodbye: _enum(["sleep", "quit"]).nullable(),
    copies: array(
      strictObject({
        name: string().min(1).max(64),
        copyAt: number().int().nonnegative().nullable(),
        newer: boolean()
      })
    ).max(64),
    ready: boolean(),
    asked: strictObject({
      state: _enum(["running", "started", "refused"]),
      text: string().min(1).max(600)
    }).nullable()
  });
  const STEPPED_DOWN_LINES = 20;
  const steppedDownSchema = strictObject({
    from: string().min(1).max(160),
    at: number().int().nonnegative(),
    since: number().int().nonnegative().nullable(),
    lines: array(
      strictObject({
        task: string().max(160),
        at: number().int().nonnegative(),
        text: string().max(300)
      })
    ).max(STEPPED_DOWN_LINES)
  });
  discriminatedUnion("role", [
    strictObject({
      role: literal("home"),
      left: strictObject({
        name: string().min(1).max(128),
        reason: leftReasonSchema,
        at: number().int().nonnegative()
      }).nullable(),
      /**
       * The times the window here read everything again after a gap in what
       * its first mate told it over the local door; absent until the first.
       */
      caughtUp: number().int().positive().optional(),
      /**
       * The times the window's link to its first mate over the local door came
       * back after a drop, replayed or not; absent until the first. The window
       * asks its one-time reads again on each.
       */
      linkBack: number().int().positive().optional(),
      /**
       * The window was opened beside Infinitary started by a command, which no
       * longer runs (`./commandNotice.ts`): absent while it runs, and in a
       * window whose own program runs the first mate.
       */
      command: commandNoticeSchema.optional(),
      /**
       * The window stands beside Infinitary started by a command, which runs
       * the first mate in a program of its own (docs/run.md, "Quit and Stop"):
       * quitting closes only the window, and Settings → General offers Stop.
       */
      byCommand: literal(true).optional()
    }),
    strictObject({
      role: literal("view"),
      name: string().min(1).max(128),
      address: string().min(1).max(256),
      joinedAt: number().int().nonnegative(),
      contact: viewContactSchema,
      readOnly: _enum(["newer-there", "older-there"]).nullable(),
      /**
       * While `readOnly`, the first mate there still hears this Mac's
       * plain-text messages (the `messages-while-reading` contract change), so
       * the message box stays on (docs/view.md, "Two versions apart").
       */
      messagesWhileReading: literal(true).optional(),
      /**
       * The first mate there answers its own update's requests
       * (`inf:home-update:*`, the `home-update` contract change), so Settings
       * → General offers its Update row (docs/view.md, "Updating the first
       * mate's computer").
       */
      homeUpdates: literal(true).optional(),
      /**
       * The first mate's computer resets itself when this Mac's Reset
       * Infinitary row asks (`inf:home-reset:start`, the `home-reset` contract
       * change), so Settings → General offers that row (docs/reset.md).
       */
      homeResets: literal(true).optional(),
      heardAt: number().int().nonnegative().nullable(),
      caughtUp: number().int().nonnegative(),
      /**
       * The times this Mac's link to the first mate there came back after a
       * drop, replayed or not; absent until the first. The window asks its
       * one-time reads again on each.
       */
      linkBack: number().int().positive().optional(),
      /**
       * The pushes this Mac missed are still arriving from a welcome that
       * replays them, so the window says it is catching up until they are in
       * (docs/view.md, "Live, catching up or out of reach").
       */
      replaying: literal(true).optional(),
      runsWork: boolean().optional(),
      /**
       * The first mate there is too old to answer what every view now asks
       * (the `every-view-asks` contract change), so its settings and sign-ins
       * wait for an update there (docs/view.md, "A first mate on an older version").
       */
      needsUpdateThere: literal(true).optional(),
      /**
       * The first mate there is too old to show a task's browser here (the
       * `browser-from-any-view` contract change), so its view says to update
       * Infinitary there (docs/view.md, "A task's browser on a view").
       */
      browserNeedsUpdateThere: literal(true).optional(),
      /**
       * The first mate there cannot take a sign-in's return from this computer
       * (the `sign-in-return` contract change), so a sign-in whose page comes
       * back to that computer waits for an update there (docs/view.md, "A
       * sign-in that returns to the first mate's computer").
       */
      returnsNeedUpdateThere: literal(true).optional(),
      /**
       * A sign-in there waits for its page's return from this computer, by the
       * return's id: `caught` while this computer listens for the browser, and
       * false when it could not, so Settings asks for the address instead.
       */
      signInReturn: strictObject({ id: string().min(1).max(64), caught: boolean() }).optional(),
      /**
       * The first mate there does not answer a view its computers, phones
       * and Knowledge (the `devices-from-a-view` contract change), so Devices
       * waits for an update there (docs/view.md, "A first mate on an older version").
       */
      devicesNeedUpdateThere: literal(true).optional(),
      /**
       * This Mac keeps a copy of the first mate's record and the first mate
       * is out of reach: Take over, with what it is based on (docs/devices.md,
       * "Taking over"). Absent while that Mac is in reach, or this Mac keeps
       * no whole copy.
       */
      takeOver: takeOverOfferSchema.optional(),
      /**
       * This Mac's own work half is not running, or has not reached the first
       * mate's computer, and why (docs/view.md, "A Mac that runs work"): the
       * window's notice says so with Try again. Absent while it runs and is
       * in reach, or is still being set up.
       */
      workSetup: deviceWorkSetupSchema.optional(),
      /**
       * A second first mate answered with the same home number but another
       * takeover (docs/devices.md, "Two homes with one number"): this Mac
       * refused it and stays with the one it knew; its name when it said one.
       */
      twoHomes: strictObject({ name: string().max(200).nullable() }).optional(),
      /**
       * This Mac was the first mate's home until a computer that kept a copy
       * took over (docs/devices.md, "An old home that returns"): what it saved
       * after that copy, which never reached it. Absent otherwise.
       */
      steppedDown: steppedDownSchema.optional(),
      /**
       * The first mate's computer removed the entry this window held while this
       * Mac's work still runs for it as another, so the window carries on as
       * that one (docs/view.md, "A Mac that runs work"): when it did. Absent
       * otherwise.
       */
      carriedOn: strictObject({ at: number().int().nonnegative() }).optional()
    })
  ]);
  discriminatedUnion("ok", [
    strictObject({ ok: literal(true) }),
    strictObject({
      ok: literal(false),
      refused: _enum([
        "not-a-link",
        "kind",
        "used",
        "expired",
        "unknown",
        "unreachable",
        "not-that-mac",
        "other"
      ])
    })
  ]);
  function userDisplayName(user) {
    return `${user.charAt(0).toUpperCase()}${user.slice(1)}`;
  }
  function deviceLabel(device) {
    return device.onThisMac && device.user ? `Running as ${userDisplayName(device.user)}` : device.name;
  }
  const loadDemandSchema = object({
    cpu: number().finite().positive(),
    memoryBytes: number().int().positive().max(Number.MAX_SAFE_INTEGER)
  });
  const loadRunSchema = object({
    id: string().uuid(),
    taskId: string().min(1),
    demand: loadDemandSchema,
    state: _enum(["waiting", "running"]),
    ahead: number().int().nonnegative(),
    reason: _enum(["line", "capacity", "pressure", "unavailable"]).optional(),
    /** First in line and waiting for room: what the line had to give when it last compared. */
    free: object({
      cpu: number().finite().nonnegative(),
      memoryBytes: number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
    }).optional()
  });
  const loadSnapshotSchema = object({ runs: array(loadRunSchema) });
  const computerLoadReadingSchema = loadSnapshotSchema.extend({
    status: _enum(["fresh", "unknown"])
  });
  const LOAD_ORDER = "inf:computer:load";
  ({
    [LOAD_ORDER]: {
      request: tuple([object({ overrides: array(string().min(1)) })])
    }
  });
  const stopLabelSchema = string().trim().min(1).max(120);
  const stopCommandSchema = string().trim().min(1).max(4e3);
  const taskStopSchema = object({
    id: string().regex(/^s[1-9][0-9]*$/),
    label: stopLabelSchema,
    command: stopCommandSchema,
    /** The folder the crewmate's shell was in when it registered the stop. */
    cwd: string().max(4096).optional(),
    /** When it was registered, in ms since the epoch. */
    at: number().int().nonnegative()
  });
  const taskKeepSchema = object({
    id: string().regex(/^s[1-9][0-9]*$/),
    label: stopLabelSchema,
    check: stopCommandSchema,
    remove: stopCommandSchema,
    folder: string().min(1).max(4096),
    /** The system account the job runs as: the one the crewmate's shell runs as there. */
    account: string().max(256),
    cwd: string().max(4096).optional(),
    at: number().int().nonnegative()
  });
  object({
    next: number().int().positive(),
    stops: array(taskStopSchema),
    keeps: array(taskKeepSchema).optional()
  });
  const stopOutcomeSchema = object({
    label: stopLabelSchema,
    outcome: _enum(["ran", "failed", "timed-out"]),
    exitCode: number().int().optional()
  });
  const programOutcomeSchema = object({
    pid: number().int().positive(),
    /** The program's own short name, as the system lists it. */
    name: string().max(64),
    outcome: _enum(["ended", "killed", "gone", "survived"]),
    /**
     * Its birth as the system listed it at the close, so a later end can tell
     * it from a new program given the same number.
     */
    started: string().max(64).optional()
  });
  const leftoversReportSchema = object({
    stops: array(stopOutcomeSchema),
    programs: array(programOutcomeSchema),
    handedTo: string().min(1).max(64).optional(),
    handed: number().int().nonnegative().optional(),
    holders: _enum(["checked", "unsupported", "unreadable"]),
    /**
     * The close kept what it could not finish in the task's folder there
     * (`leftBehindSchema`), so the computer's list says when it is cleared.
     */
    keptInFile: literal(true).optional(),
    /** The keeps a merged or answered close left running, which the home records (`KeptJobs`). */
    kept: array(taskKeepSchema.omit({ cwd: true, at: true })).optional(),
    /** How each keep's remove went at a discard, cancel or failure close, after the stops. */
    removed: array(stopOutcomeSchema).optional(),
    /** How many keeps went to `handedTo` with the stops. */
    handedKeeps: number().int().nonnegative().optional()
  });
  ({
    request: {
      carriedTo: object({ task: string().regex(/^[A-Za-z0-9_-]{1,64}$/), key: string().min(1).max(64) }).optional(),
      /** When the task started, in ms since the epoch: a program running before it is not its leftover. */
      startedAt: number().int().nonnegative().optional(),
      /**
       * What the close does with the task's keeps (`kept-jobs.md`): a merged or
       * answered close keeps them running, any other runs their removes.
       * Absent, as from a home without the change, they are removed.
       */
      keeps: _enum(["keep", "remove"]).optional()
    },
    response: object({ ok: literal(true), leftovers: leftoversReportSchema.optional() })
  });
  object({
    stops: array(
      taskStopSchema.extend({
        outcome: _enum(["failed", "timed-out"]),
        exitCode: number().int().optional()
      })
    ),
    programs: array(
      object({
        pid: number().int().positive(),
        name: string().max(64),
        started: string().min(1).max(64)
      })
    )
  });
  const taskIdSchema = string().regex(/^[A-Za-z0-9_-]{1,64}$/);
  object({
    stops: array(
      object({
        task: taskIdSchema,
        id: string().regex(/^s[1-9][0-9]*$/),
        label: stopLabelSchema,
        outcome: _enum(["failed", "timed-out"]),
        exitCode: number().int().optional(),
        /** Only in the stops command's own answer to a look on that computer, never in the order. */
        command: stopCommandSchema.optional(),
        cwd: string().max(4096).optional()
      })
    ),
    programs: array(
      object({
        task: taskIdSchema,
        pid: number().int().positive(),
        name: string().max(64),
        started: string().min(1).max(64)
      })
    ),
    runs: array(
      object({
        task: taskIdSchema,
        id: string().uuid(),
        state: _enum(["waiting", "running"]),
        demand: loadDemandSchema
      })
    ),
    kept: array(taskIdSchema)
  });
  const LEFT_BEHIND_ORDER = "inf:computer:left-behind";
  ({
    [LEFT_BEHIND_ORDER]: {
      request: tuple([])
    }
  });
  const keptCheckOutcomeSchema = _enum([
    "running",
    "not-running",
    "timed-out",
    "unreachable"
  ]);
  const keptRemoveFailureSchema = _enum(["failed", "timed-out", "unreachable"]);
  const keptCheckSchema = object({
    at: number().int().nonnegative(),
    outcome: keptCheckOutcomeSchema
  });
  const keptRemoveFailedSchema = object({
    at: number().int().nonnegative(),
    outcome: keptRemoveFailureSchema,
    exitCode: number().int().optional()
  });
  const keptJobViewSchema = object({
    /** Its kept folder's own name (`<task>-<keep id>`), with `@` and the computer's id for a job on a computer that runs work. */
    id: string().min(1).max(256),
    label: stopLabelSchema,
    /** The computer that runs work it runs on, by device id; null for the home itself. */
    computer: string().min(1).max(128).nullable(),
    /** That computer's name, as Settings → Computers names it. */
    computerName: string().max(256),
    account: string().max(256),
    task: string().min(1).max(64),
    key: string().max(64),
    /** When its task's close kept it, in ms since the epoch. */
    at: number().int().nonnegative(),
    checked: keptCheckSchema.optional(),
    removeFailed: keptRemoveFailedSchema.optional()
  });
  object({
    jobs: array(keptJobViewSchema)
  });
  object({
    id: string(),
    removed: boolean(),
    job: keptJobViewSchema.optional()
  });
  const KEPT_JOB_ORDER = "inf:computer:kept-job";
  ({
    [KEPT_JOB_ORDER]: {
      request: tuple([
        object({
          action: _enum(["check", "remove"]),
          label: stopLabelSchema,
          command: stopCommandSchema,
          folder: string().min(1).max(4096)
        })
      ]),
      response: object({
        outcome: _enum(["ran", "failed", "timed-out"]),
        exitCode: number().int().optional()
      })
    }
  });
  const RESOURCE_SAMPLE_MS = 250;
  const RESOURCE_MAX_SAMPLE_MS = 5e3;
  const RESOURCE_MAX_AGE_MS = 1e4;
  const RESOURCE_ORDER = "inf:computer:resources";
  const bytes = number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
  const macMemoryPressureSchema = _enum(["normal", "warning", "critical"]);
  const resourceMemorySchema = object({
    totalBytes: bytes.positive(),
    /** Swap occupancy, not part of installed memory or the placement allowance. */
    swapUsedBytes: bytes.optional(),
    freeBytes: bytes,
    /** Linux MemAvailable. A reading with this is Linux to the one memory figure. */
    availableBytes: bytes.optional(),
    /** macOS facts. A reading with either of these is a Mac to the one memory figure. */
    purgeableBytes: bytes.optional(),
    fileBackedBytes: bytes.optional(),
    /** macOS inactive and speculative pages. Absent on Linux, an older computer, or a failed read. */
    inactiveBytes: bytes.optional(),
    speculativeBytes: bytes.optional(),
    /** Absent when macOS did not report a pressure level with this sample. */
    memoryPressure: macMemoryPressureSchema.optional()
  });
  const processShareSchema = object({
    processCount: number().int().nonnegative(),
    residentBytes: bytes,
    /** Processor equivalents from cumulative process-time deltas; omitted for new/unreadable processes. */
    cpuCores: number().nonnegative().optional()
  });
  const processResourcesSchema = discriminatedUnion("status", [
    object({
      status: literal("sampled"),
      processCount: number().int().nonnegative(),
      tasks: array(processShareSchema.extend({ taskId: string().min(1) })),
      other: processShareSchema
    }),
    object({ status: literal("unknown") })
  ]);
  const stamp = {
    /** One sampler lifetime; no host clock or permanent hardware identifier crosses. */
    epoch: string().uuid(),
    sequence: number().int().positive().max(Number.MAX_SAFE_INTEGER)
  };
  const sampledResourceObservationSchema = object({
    ...stamp,
    status: literal("sampled"),
    sampleMs: number().min(RESOURCE_SAMPLE_MS).max(RESOURCE_MAX_SAMPLE_MS),
    cpu: object({
      logicalCpus: number().int().positive().max(65536),
      /** Mean idle share over a CPU-time delta, not a load average. */
      idleFraction: number().min(0).max(1)
    }),
    memory: resourceMemorySchema,
    /** Absent on older computers. Process identifiers never cross the connection. */
    processes: processResourcesSchema.optional()
  });
  discriminatedUnion("status", [
    sampledResourceObservationSchema,
    object({
      ...stamp,
      status: literal("unknown"),
      reason: _enum(["unavailable", "interrupted"])
    })
  ]);
  const computerResourceReadingSchema = discriminatedUnion("status", [
    object({
      status: literal("fresh"),
      observation: sampledResourceObservationSchema,
      ageMs: number().nonnegative().max(RESOURCE_MAX_AGE_MS),
      /**
       * Installed memory the home counts as used, once, by Automatic's rule.
       * Absent when the reading has no figure. At most `totalBytes`
       * (`validMemoryUsedBytes`).
       */
      memoryUsedBytes: bytes.optional()
    }),
    object({
      status: literal("unknown"),
      reason: _enum([
        "missing",
        "stale",
        "out-of-reach",
        "unsupported",
        "unavailable",
        "invalid",
        "timeout"
      ])
    })
  ]);
  object({
    computers: array(
      object({
        computerId: string().min(1).max(128).nullable(),
        label: string().min(1).max(256),
        reading: computerResourceReadingSchema,
        load: computerLoadReadingSchema.optional()
      })
    )
  });
  ({
    [RESOURCE_ORDER]: {
      request: tuple([])
    }
  });
  const CUT_OFF_CLASSES = ["signed_out", "no_headroom", "refused"];
  const CLAUDE_ACCESS_SOURCES = ["organization", "claude-settings"];
  const CLAUDE_ACCESS_LABEL = {
    organization: "set up by your organization",
    "claude-settings": "from your Claude Code settings"
  };
  const CLAUDE_GATEWAY_LABEL = {
    organization: "sent through your organization's address",
    "claude-settings": "sent through the address in your Claude Code settings"
  };
  const CLAUDE_ACCESS_REFUSED_TEXT = {
    organization: "Work is paused because your organization's Claude sign-in was refused. Renew it the way your organization asks, then press Try again.",
    "claude-settings": "Work is paused because the Claude sign-in in your Claude Code settings was refused. Renew it, then press Try again."
  };
  const CLAUDE_ACCESS_TRY_AGAIN_LABEL = "Try again";
  const ACCOUNT_LABEL_MAX = 64;
  const credentialKindSchema = _enum(["subscription_oauth", "api_key"]);
  const accountViewSchema = object({
    id: string(),
    providerId: string(),
    kind: credentialKindSchema,
    /** User-facing name: Claude follows its current identity; other providers can be renamed. */
    label: string(),
    /** Disabled accounts keep their credentials but leave the selection pool. */
    enabled: boolean(),
    /** Whether the store currently holds a usable credential. */
    connected: boolean(),
    /**
     * Local proof this account needs a sign-in (a lapsed refresh token).
     * Distinct from a missing first-run login and from a retryable miss.
     */
    needsReauth: boolean().optional(),
    /** The provider-level account pin (the one that always wins selection). */
    pinned: boolean(),
    /**
     * Keep going on credits (docs/quota.md): once its allowance is spent, the
     * account keeps serving on the credits set up with its provider. Absent is off.
     */
    keepGoingOnCredits: boolean().optional(),
    /**
     * Use saved resets on their own (docs/quota.md "Saved resets on their
     * own"): with work waiting on its spent Codex allowance, Infinitary may
     * use one of its saved resets without a click. Absent is off.
     */
    useSavedResets: boolean().optional(),
    createdAt: number(),
    lastConnectedAt: number().optional(),
    /**
     * Who the provider says signed in - an email or org - where the provider
     * reports one at all: Claude's email, or the GitHub username a Copilot
     * account signed in as. Never a credential, and never the internal
     * account id.
     */
    identity: string().optional(),
    /** The plan the provider reports ("Max", "Pro"), when it reports one. */
    plan: string().optional(),
    /**
     * Where a Claude account's access comes from when it is not a
     * subscription sign-in: a token command set up for Claude Code by an
     * organization, or in the person's own Claude Code settings
     * (`src/shared/claudeAccess.ts`). Absent for a subscription.
     */
    access: _enum(CLAUDE_ACCESS_SOURCES).optional(),
    /**
     * Who set the address a Claude subscription's requests go to, when Claude
     * Code's settings name an address and no token command. Absent otherwise.
     */
    gateway: _enum(CLAUDE_ACCESS_SOURCES).optional(),
    /**
     * Why this account cannot serve right now although its credential is
     * fine, in the backend's own sentence: a Claude account whose machine has
     * no Claude Code, or one too old (`src/shared/claudeClient.ts`). Rendered
     * verbatim; absent when the account can serve.
     */
    detail: string().optional(),
    /**
     * A typed cut-off standing on this account (docs/quota.md, "Typed
     * cut-offs"): its class, when it was seen, and a spent allowance's reset
     * (epoch ms). A computer that runs work tells its home this with its
     * sign-ins, so a task there waits as one on the home's own accounts does
     * (docs/helper.md, "Its own sign-ins"). Absent when none stands.
     */
    cutOff: object({
      class: _enum(CUT_OFF_CLASSES),
      since: number(),
      resetsAt: number().optional()
    }).optional()
  });
  function standingCutOff(account, now) {
    const cutOff = account.cutOff;
    if (!cutOff) return void 0;
    if (cutOff.class === "no_headroom" && (cutOff.resetsAt ?? 0) <= now) return void 0;
    return cutOff;
  }
  const machineLoginOutcomeSchema = _enum(["signed-out", "kept", "not-signed-out"]);
  const crewSpeedSchema = _enum(["standard", "fast", "ultrafast"]);
  object({
    requested: crewSpeedSchema,
    sent: crewSpeedSchema,
    /** Only a provider reply can confirm service. */
    confirmed: string().optional(),
    reason: string().optional()
  });
  const customFileWarningSchema = _enum([
    /** `apiKey`: the key is typed on each computer instead. */
    "key",
    "oauth",
    "auth-header",
    /** A header value naming an environment variable (`$`) or a command (`!`). */
    "header-reference",
    "model-overrides",
    "sampling",
    /** A model's own `baseUrl` or `api` that differs from its connection's. */
    "model-address",
    "model-headers",
    /** Another Pi setting Infinitary does not read, such as `promptCache`. */
    "unused",
    /** Kept history and the summary's room do not fit the model's window. */
    "compaction"
  ]);
  const customFileRefusalSchema = _enum([
    /** Its name is a provider Pi has built in, which it would repoint. */
    "built-in",
    "address",
    /** No `api`, or one Infinitary does not speak. */
    "protocol",
    /** A setting has the wrong shape, such as a model without an id or one listed twice. */
    "invalid"
  ]);
  const customFileDefinitionSchema = object({
    label: string().min(1).max(64),
    baseUrl: string().max(4096),
    protocol: customProtocolSchema,
    headers: array(
      object({ name: string().max(128), secret: boolean(), value: string().optional() })
    ),
    compaction: customCompactionSchema.optional(),
    models: array(customModelInputSchema)
  });
  const customFileConnectionSchema = object({
    /** The provider's key in the file: the connection's identity there. */
    name: string(),
    refused: customFileRefusalSchema.optional(),
    warnings: array(
      object({
        kind: customFileWarningSchema,
        model: string().optional(),
        /** The file's own key, such as `apiKey` or `promptCache`. */
        key: string().max(128).optional()
      })
    ),
    definition: customFileDefinitionSchema.optional()
  });
  object({
    path: string().nullable(),
    failure: _enum(["missing", "unreadable", "invalid"]).optional(),
    connections: array(customFileConnectionSchema)
  });
  const customHomeDefinitionSchema = object({
    name: string().min(1).max(256),
    definition: customFileDefinitionSchema
  });
  const forgeSignInStateSchema = _enum(["ok", "needs_reauth", "unavailable", "unknown"]);
  const forgeServerViewSchema = object({
    kind: string().min(1).max(32),
    name: string().min(1).max(64),
    /** This kind also offers browser sign-in with a registered application. */
    browser: boolean().optional()
  }).strict();
  const forgeSignInViewSchema = object({
    /** The host name the sign-in is for, lower case ("github.com"). */
    host: string().min(1).max(253),
    /** The person's word for the host ("GitHub", a GitHub Enterprise host's address). */
    name: string().min(1).max(64),
    /** Who the host says the person is; null until it has answered once. */
    login: string().max(100).nullable(),
    state: forgeSignInStateSchema,
    /** How many of the person's projects live on this host. */
    projects: number().int().nonnegative(),
    /** When the sign-in was made. */
    since: number().int().nonnegative(),
    /** Public application identifier, never an application secret. */
    applicationId: string().max(256).optional(),
    server: forgeServerViewSchema.optional(),
    /** The sign-in is GitHub CLI's, asked each time it is needed; absent for the app's own. */
    way: _enum(["cli"]).optional()
  }).strict();
  const forgeHostViewSchema = object({
    host: string().min(1).max(253),
    name: string().min(1).max(64),
    server: forgeServerViewSchema.optional()
  }).strict();
  const forgeSignInFlowSchema = object({
    host: string().min(1).max(253),
    userCode: string().min(1).max(32),
    verificationUri: string().url(),
    expiresAt: number().int().nonnegative()
  }).strict();
  const forgeStartProblemSchema = _enum([
    "not-allowed",
    "client",
    "scope",
    "not-found",
    "unreachable",
    "answer"
  ]);
  const forgeSignInEndSchema = object({
    host: string().min(1).max(253),
    end: _enum(["expired", "failed"]),
    /** Why a browser sign-in could not start, as the host answered; absent when it gave no reason. */
    problem: forgeStartProblemSchema.optional()
  }).strict();
  object({
    signIns: array(forgeSignInViewSchema),
    hosts: array(forgeHostViewSchema),
    /** The kinds of server a host can be added by its address and a key: a chip each. */
    servers: array(forgeServerViewSchema).optional(),
    flow: forgeSignInFlowSchema.nullable(),
    ended: forgeSignInEndSchema.nullable(),
    /** GitHub CLI is installed on this computer, so a GitHub host can sign in through it. */
    githubCli: boolean().optional()
  }).strict();
  const forgeProjectSchema = object({
    fullName: string(),
    cloneUrl: string(),
    url: string().nullable(),
    updatedAt: string().nullable(),
    private: boolean()
  });
  object({
    projects: array(forgeProjectSchema),
    complete: boolean()
  });
  const forgeKeySignInSchema = object({
    kind: string().min(1).max(32),
    address: string().min(1).max(2e3),
    key: string().min(1).max(1024)
  }).strict();
  const forgeBrowserSignInSchema = object({
    kind: string().min(1).max(32),
    address: string().min(1).max(2e3),
    applicationId: string().trim().regex(/^[A-Za-z0-9_-]{20,256}$/)
  }).strict();
  const forgeKeyProblemSchema = _enum([
    "address",
    "public-host",
    "key",
    "refused",
    "unreachable",
    "not-server"
  ]);
  discriminatedUnion("ok", [
    object({ ok: literal(true), host: string().min(1).max(253) }).strict(),
    object({
      ok: literal(false),
      problem: forgeKeyProblemSchema,
      host: string().max(253).nullable()
    }).strict()
  ]);
  const forgeCliProblemSchema = _enum([
    "not-github",
    "missing",
    "none",
    "refused",
    "unreachable",
    "failed"
  ]);
  discriminatedUnion("ok", [
    object({ ok: literal(true), host: string().min(1).max(253) }).strict(),
    object({
      ok: literal(false),
      problem: forgeCliProblemSchema,
      host: string().max(253).nullable()
    }).strict()
  ]);
  const FORGE_HOST_NAME = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*$/;
  const forgeChangeRowSchema = object({
    host: string().min(1).max(253),
    /** `owner/name`; a GitLab project's whole path, `group/subgroup/name`. */
    project: string().min(1).max(200),
    number: number().int().nonnegative(),
    /** The host's own name for it: `#12` on GitHub, `!4` on GitLab. */
    label: string().min(1).max(32).optional(),
    title: string().max(1e3),
    url: string().max(2e3),
    draft: boolean(),
    checks: _enum(["passed", "failed", "pending", "none"]),
    updatedAt: string().max(64).nullable()
  }).strict();
  object({
    /** Whether any host has the app's sign-in; with none there is nothing to list. */
    signedIn: boolean(),
    /** False when a signed-in host could not be read this time; the rows are then empty. */
    reachable: boolean(),
    changes: array(forgeChangeRowSchema)
  }).strict();
  const reasoningSchema = object({
    level: _enum(["off", "minimal", "low", "medium", "high", "xhigh", "max", "default"]),
    lower: _enum(["quick", "capped"]).optional()
  });
  const slotSchema = _enum(["premium", "high", "medium", "low"]);
  const slotMembershipSchema = union([slotSchema, array(slotSchema)]).transform((value) => Array.isArray(value) ? value : [value]);
  const reasoningChoiceSchema = _enum(["low", "medium", "high", "xhigh", "max"]);
  const reasoningCapabilitiesSchema = object({
    levels: array(reasoningChoiceSchema),
    fixed: _enum(["off", "default"]).optional()
  });
  const reasoningOverridesSchema = record(
    string(),
    partialRecord(slotSchema, reasoningChoiceSchema)
  );
  object({
    version: literal(1),
    /** offering → slots. An absent key or an empty array is OFF: never auto-picked, still pinnable. */
    assignments: record(string(), slotMembershipSchema),
    /** every offering this install has ever been offered. Seeding only touches keys absent here. */
    seen: array(string()),
    /** Choices survive membership changes; absent means inherit. */
    reasoning: reasoningOverridesSchema.optional(),
    /** Per offering, shared by every account; absent means Standard. */
    speed: record(string(), crewSpeedSchema).optional(),
    /**
     * offering → when it arrived as announced news (epoch ms), for the board's
     * "new" mark. Saved, so a later catalog read or a restart keeps the mark
     * until the person changes the model's levels or it has had a week.
     */
    arrived: record(string(), number()).optional()
  });
  record(string(), array(string()));
  const servedStartersSchema = object({
    schema: literal(1),
    starters: record(string(), record(string(), array(slotSchema)))
  });
  object({
    starters: servedStartersSchema.shape.starters.nullable(),
    checkedAt: number()
  });
  const slotModelViewSchema = object({
    /** Pi provider id serving this model (never the quota id). */
    provider: string(),
    providerLabel: string(),
    id: string(),
    label: string(),
    /** empty = off (in no slot); may carry more than one. */
    slots: array(slotSchema),
    reasoningCapabilities: reasoningCapabilitiesSchema.optional(),
    speed: crewSpeedSchema.optional(),
    /** Union of fresh account capabilities, not a promise about a routed account. */
    speeds: array(crewSpeedSchema).optional(),
    reasoning: partialRecord(
      slotSchema,
      object({
        chosen: reasoningChoiceSchema.optional(),
        effective: reasoningSchema.optional()
      })
    ).optional(),
    /**
     * Arrived as announced news after this install had already seen the
     * provider's catalog, within the last week and with its levels untouched since.
     */
    isNew: boolean().optional(),
    /** The computer the model runs on, when it is not this Mac's. */
    place: string().min(1).max(64).optional()
  });
  object({
    /** The listed rows (docs/model-lists.md): what the board shows. */
    models: array(slotModelViewSchema),
    /**
     * Everything else the signed-in accounts serve, for the "use a model by
     * name" controls. Never rows on the board; choosing one keeps it, which
     * lists it from then on.
     */
    byName: array(slotModelViewSchema).default([]),
    /**
     * True when nothing currently available is assigned, so routing is running
     * off the starter map (or the whole signed-in pool). The surface says so.
     */
    usingDefaults: boolean()
  });
  const quotaWindowViewSchema = object({
    id: string(),
    label: string(),
    percentRemaining: number().optional(),
    /**
     * Pace vocabulary: "ahead" is usage ahead of the reset
     * clock (burning faster than linear - conserve), "behind" is usage behind
     * the clock (allowance on track to go unused).
     */
    pace: _enum(["ahead", "on_pace", "behind", "unknown"]).optional(),
    resetText: string().optional(),
    /**
     * The trusted cycle evidence: the window's own reset
     * instant and cycle length, when the vendor supplied them. Everything
     * derived - pace, runway, spend priority - is recomputed from these at
     * read time rather than persisted, so a stored snapshot never carries a
     * stale projection.
     */
    resetsAtMs: number().optional(),
    startsAtMs: number().optional(),
    windowSeconds: number().optional()
  });
  const QUOTA_CREDIT_STATES = ["available", "spent", "off", "unknown"];
  const quotaCreditsViewSchema = object({
    state: _enum(QUOTA_CREDIT_STATES),
    /** The share of a monthly spend limit used, 0–100, where the provider gives one (Claude). */
    usedPercent: number().optional(),
    /** The balance left, in the provider's own words (ChatGPT's "15.00"). */
    balance: string().optional(),
    /** The provider says the credits have no limit. */
    unlimited: boolean().optional(),
    /** The provider says this account is answering on credits right now. */
    inUse: boolean().optional()
  });
  const quotaSavedResetsViewSchema = object({
    available: number().int().nonnegative(),
    applicable: number().int().nonnegative().optional()
  });
  const SAVED_RESETS_PAGE = {
    codex: "https://chatgpt.com/settings/usage"
  };
  const quotaProviderViewSchema = object({
    /** Quota provider id: codex, grok, claude, copilot. */
    provider: string(),
    label: string(),
    /**
     * The vault account these windows belong to (broker phase 2). Absent only
     * in legacy fixtures/snapshots, which render as a single unnamed account.
     */
    accountId: string().optional(),
    /** The account's user label ("Personal", "Work #2"). */
    accountLabel: string().optional(),
    plan: string().optional(),
    /** Provider-reported identity (an email or org), when the fetch knows it. */
    account: string().optional(),
    /**
     * What the sensor actually established, kept distinct so the surface can
     * say it (quota reliability, 2026-09-04):
     * - `ok` a real reading,
     * - `auth_required` the terminal re-auth state (CD-3): reached only from
     *   proof - a lapsed refresh token (`refresh_token_lapsed`) or a vendor
     *   rejection that SURVIVED a real renewal (`rejected_after_renewal`).
     *   The ONLY status that may say "sign in again", raise the re-auth card,
     *   or clear a recovered card. Transient failures never take this shape,
     * - `rate_limited` the vendor asked us to back off (`retryAfter` when given),
     * - `unavailable` we could not find out this time (network, timeout, a
     *   non-2xx, an unreadable store, a renewal that could not run). Transient
     *   by assumption; last-known-good survives it,
     * - `not_measured` Infinitary does not read a usage window for this sign-in.
     *   NOT a claim that the credential cannot expose one,
     * - `skipped` the account was not sensed on this pass.
     * `error` remains only so older persisted snapshots still parse.
     */
    status: _enum([
      "ok",
      "auth_required",
      "rate_limited",
      "unavailable",
      "not_measured",
      "error",
      "skipped"
    ]),
    stale: boolean(),
    /**
     * When these windows were actually measured. Present whenever a row is
     * carried forward, so a stale card can state its age instead of borrowing
     * the new snapshot's fetch time.
     */
    measuredAt: number().optional(),
    /**
     * A sanitized machine reason for a non-ok status: a code from our own
     * vocabulary, never provider text, never a header, never a URL.
     */
    reason: string().optional(),
    /** RFC 9110 Retry-After, as the vendor sent it, when it sent one. */
    retryAfter: string().optional(),
    windows: array(quotaWindowViewSchema),
    /** Paying past the allowance, as the provider reports it (`quotaCreditsViewSchema`). */
    credits: quotaCreditsViewSchema.optional(),
    savedResets: quotaSavedResetsViewSchema.optional(),
    /**
     * The account's Keep going on credits switch is on, as the vault holds it
     * (`answersOnCredits`). Absent is off.
     */
    keepGoingOnCredits: boolean().optional(),
    /**
     * Disclosed uncertainty, in the user's words, for a row with no window.
     * The surface renders it instead of a silent blank, and it is never a
     * substitute for a real window. It says what Infinitary did or did not do -
     * never that a credential is incapable of exposing usage, which no test
     * here has established.
     */
    detail: string().optional()
  });
  const KEYCHAIN_VALUE_FAILURES = [
    "keychain_locked",
    "keychain_access_denied",
    "keychain_prompt_timeout",
    "keychain_unavailable",
    "keychain_unreadable",
    "keychain_needs_grant",
    "keychain_no_interactive_session",
    "keychain_read_incomplete"
  ];
  function isKeychainValueFailure(reason) {
    return reason !== void 0 && KEYCHAIN_VALUE_FAILURES.includes(reason);
  }
  const quotaSnapshotViewSchema = object({
    generatedAt: string(),
    fetchedAt: number(),
    providers: array(quotaProviderViewSchema)
  });
  const catalogModelViewSchema = object({
    /** Quota provider id. */
    provider: string(),
    id: string(),
    label: string(),
    effectivePercentRemaining: number().optional(),
    paceStatus: _enum(["ahead", "on_pace", "behind", "unknown"]).optional(),
    /**
     * The per-scope selection signal: positive means paid
     * allowance is on track to reach reset unused (spend here first), zero is
     * exact utilization, negative is overdrawn against the reset clock.
     * Absent means unmeasurable - never rendered or ranked as zero.
     */
    spendPriority: number().optional(),
    /**
     * Whether every window bounding this scope is projected, at its observed
     * burn, to last until its reset (INF-898): true lasts, false runs out
     * first (or is spent). Absent means the runway is unknown.
     */
    lastsThroughReset: boolean().optional(),
    /**
     * Every allowance serving this model is spent, and an account serving it
     * answers on credits (`answersOnCredits`): the model still routes, in the
     * last band, after every included allowance. Absent is not on credits.
     */
    onCredits: boolean().optional()
  });
  object({
    generatedAt: string(),
    models: array(catalogModelViewSchema)
  });
  const modelPinSchema = object({ provider: string(), id: string() });
  object({ provider: string(), id: string() });
  object({
    // Kept on the wire for older paired views; the home always reports true.
    dynamicRouting: boolean(),
    pins: array(modelPinSchema),
    dormantPins: array(modelPinSchema).optional()
  });
  const QUOTA_TO_PI_PROVIDER = {
    codex: "openai-codex",
    grok: "xai",
    claude: "anthropic-claude",
    kimi: "kimi-coding",
    copilot: "github-copilot",
    // Its own name in both worlds: "opencode" is Pi's id for OpenCode Zen.
    "opencode-go": "opencode-go"
  };
  function allowanceProviderOf(provider) {
    return Object.keys(QUOTA_TO_PI_PROVIDER).find((id) => QUOTA_TO_PI_PROVIDER[id] === provider);
  }
  function isSensedProvider(providerId) {
    return allowanceProviderOf(providerId) !== void 0;
  }
  const savedResetResultSchema = object({
    outcome: _enum(["used", "nothing-to-reset", "none-left"]),
    left: number().int().nonnegative().optional()
  });
  strictObject({
    deviceId: string().min(1).max(64).optional(),
    signIn: boolean().optional()
  });
  const signInIdSchema = string().regex(/^[A-Za-z0-9_-]{1,64}$/);
  const SIGN_IN_ANSWER_MAX_CHARS = 16384;
  const okSchema = object({ ok: literal(true) });
  const forgeHostSchema = string().min(1).max(253).regex(FORGE_HOST_NAME);
  const computerForgesSchema = object({
    signIns: array(
      object({
        host: forgeHostSchema,
        /** The person's word for the host ("GitHub"). */
        name: string().min(1).max(64),
        /** Who the host says it is signed in as; null until it has answered once. */
        login: string().max(100).nullable(),
        state: forgeSignInStateSchema,
        /** When the sign-in was made there. */
        since: number().int().nonnegative(),
        /** Made through that computer's own GitHub CLI, which it asks for each sign-in. */
        way: literal("cli").optional(),
        /** A host on the person's own server, or GitLab: its kind (`computer-forge-servers`). */
        server: forgeServerViewSchema.optional(),
        /** The public Application ID a GitLab browser sign-in used there; never a secret. */
        applicationId: string().max(256).optional()
      })
    ),
    /**
     * The hosts a sign-in row is drawn for: each one that signs in with a
     * code whatever the computer has (github.com), and each other one it is
     * signed in to, with its kind.
     */
    hosts: array(
      object({
        host: forgeHostSchema,
        name: string().min(1).max(64),
        server: forgeServerViewSchema.optional()
      })
    ),
    /**
     * The kinds of server it signs in to by an address there, with a key or,
     * for GitLab, a browser code (`inf:sign-ins:forge-key`,
     * `inf:sign-ins:forge-browser`): GitHub Enterprise and GitLab. Absent from
     * a computer without `computer-forge-servers`, which signs in to
     * github.com alone.
     */
    servers: array(forgeServerViewSchema).optional(),
    /**
     * GitHub CLI is installed there, so its GitHub row offers "Use GitHub CLI"
     * (`inf:sign-ins:forge-cli`). An older computer that leaves it out
     * offers the code alone; major 15 includes this capability.
     */
    githubCli: boolean().optional()
  });
  const computerServedModelSchema = object({
    speeds: array(crewSpeedSchema).optional(),
    speedsUntil: number().int().nonnegative().optional(),
    reasoningCapabilities: reasoningCapabilitiesSchema.optional(),
    provider: string().min(1).max(256),
    id: string().min(1).max(256),
    name: string().max(256).optional()
  });
  const SERVED_MODELS_MAX = 2e3;
  const ACCOUNT_LIST_ID_MAX = 256;
  const computerServedAccountSchema = object({
    accountId: string().min(1).max(256),
    models: array(computerServedModelSchema).max(SERVED_MODELS_MAX),
    /**
     * The ids a Codex or Grok account's own model list named in its last
     * successful read there; `models` is Pi's catalog for it, unnarrowed. The
     * home narrows `models` by it behind its own rail, which protects the
     * models the captain kept (`narrowServedThere`). Absent before a read,
     * after a failed one, and from a computer older than protocol 8.7.
     */
    accountList: array(string().min(1).max(ACCOUNT_LIST_ID_MAX)).max(SERVED_MODELS_MAX).optional()
  });
  const computerSignInsSchema = object({
    /** Every provider it offers, with why one cannot sign in there (Claude Code not installed). */
    providers: array(providerViewSchema),
    accounts: array(accountViewSchema),
    /** Its last reading of each account's allowance; null before the first. */
    quota: quotaSnapshotViewSchema.nullable(),
    /** Its own sign-ins where projects live; absent from a computer older than `FORGE_SIGN_INS_SINCE`. */
    forges: computerForgesSchema.optional(),
    /**
     * Its custom API connections, as the form draws them. Absent from a
     * computer older than `CUSTOM_API_SIGN_INS_SINCE`; a computer that knows
     * them sends the array, empty when it holds none. No view carries a key.
     */
    custom: array(customApiViewSchema).max(32).optional(),
    /**
     * The models each account there can serve, as that computer read them.
     * A provider this Mac's catalog does not list (OpenRouter, a custom
     * connection) is routed from this list. Absent from a computer older
     * than `CUSTOM_API_SIGN_INS_SINCE`.
     */
    served: array(computerServedAccountSchema).max(64).optional()
  });
  const signInStepSchema = discriminatedUnion("kind", [
    /** It waits for the captain: a choice, a code to paste back, or a key. */
    object({ kind: literal("prompt"), prompt: authPromptSchema }),
    /** Where it is: a link to open, a code to read, progress. */
    object({ kind: literal("notice"), notice: authNoticeSchema }),
    object({
      kind: literal("ended"),
      /**
       * `signs-in-there`: a provider that signs in only on that computer itself
       * had no login there to adopt; the home says where to log in. Only a
       * computer older than `FORGE_SIGN_INS_SINCE` says it, of Claude Code,
       * which now signs in there with a code pasted back.
       */
      outcome: _enum(["signed-in", "failed", "cancelled", "signs-in-there"]),
      /** The account it signed in, on that computer. */
      accountId: string().optional(),
      /**
       * What using one of the account's saved Codex resets came to
       * (`inf:sign-ins:use-saved-reset`), on a use that ended with a clear
       * answer; its outcome is then `signed-in`, which an older view reads as
       * a flow that ended as asked.
       */
      savedReset: savedResetResultSchema.optional(),
      /** Why it failed, in the provider's or the computer's words. */
      error: string().optional()
    })
  ]);
  ({
    "inf:sign-ins:list": {
      request: tuple([])
    },
    /**
     * Starts a sign-in there: a new account, or `accountId` again. It answers
     * once it has started; its steps and its end come as `inf:work:sign-in`.
     */
    "inf:sign-ins:start": {
      request: tuple([
        object({
          signInId: signInIdSchema,
          providerId: string().min(1).max(256),
          type: _enum(["oauth", "api_key"]),
          accountId: string().min(1).max(256).optional()
        })
      ])
    },
    /** What the captain typed or chose for one prompt, sent once; `null` stops the sign-in. */
    "inf:sign-ins:answer": {
      request: tuple([
        object({
          signInId: signInIdSchema,
          promptId: string().min(1).max(128),
          value: string().max(SIGN_IN_ANSWER_MAX_CHARS).nullable()
        })
      ])
    },
    "inf:sign-ins:cancel": {
      request: tuple([object({ signInId: signInIdSchema })])
    },
    /**
     * Signs that computer out of one account: its store there is deleted.
     * For a Claude account it answers what became of that computer's own
     * Claude login (`login`): signed out when Firstmate made it there from a
     * pasted code, kept when it did not. A computer older than this answers
     * without it.
     */
    "inf:sign-ins:remove": {
      request: tuple([object({ accountId: string().min(1).max(256) })]),
      response: okSchema.extend({ login: machineLoginOutcomeSchema.optional() })
    },
    /**
     * Starts the computer's own sign-in where projects live (GitHub's device
     * flow), there, from `FORGE_SIGN_INS_SINCE`. Its code to read comes as a
     * `notice` step and its end as `ended`; nothing is typed, and
     * `inf:sign-ins:cancel` stops it.
     */
    "inf:sign-ins:forge": {
      request: tuple([object({ signInId: signInIdSchema, host: forgeHostSchema })])
    },
    /**
     * Signs that computer in to a GitHub host through its own GitHub CLI's
     * sign-in, there (docs/forge.md, "A computer's own sign-in"): it asks
     * GitHub CLI and the host who that is, and keeps only the way and the
     * program's path. No token crosses; the answer says only whether it was
     * kept. Offered where its forges say `githubCli`.
     */
    "inf:sign-ins:forge-cli": {
      request: tuple([object({ host: forgeHostSchema })])
    },
    /**
     * Signs that computer in to GitLab or a host on the person's own server
     * with a key made there, from `computer-forge-servers` (docs/forge.md, "A
     * computer's own sign-in"). The key rides this order once and is kept only
     * in that computer's store; the answer says whether the host answered for
     * it, never the key.
     */
    "inf:sign-ins:forge-key": {
      request: tuple([forgeKeySignInSchema])
    },
    /**
     * Starts GitLab's browser code sign-in there with a public application the
     * person registered on that host, from `computer-forge-servers`. Its code
     * to read comes as a `notice` step and its end as `ended`, as
     * `inf:sign-ins:forge`'s do.
     */
    "inf:sign-ins:forge-browser": {
      request: tuple([forgeBrowserSignInSchema.extend({ signInId: signInIdSchema })])
    },
    /** Signs that computer out where a project lives: its sign-in there is deleted. */
    "inf:sign-ins:forge-out": {
      request: tuple([object({ host: forgeHostSchema })])
    },
    /**
     * A custom API connection typed at the home and kept on this computer,
     * from `CUSTOM_API_SIGN_INS_SINCE`. The address is read here, so localhost
     * is this computer. The key and headers ride once inside `custom-connect`
     * and are kept only in this computer's store. Disconnect reuses
     * `inf:sign-ins:remove`.
     */
    "inf:sign-ins:custom-address": {
      request: tuple([string().max(4096)])
    },
    "inf:sign-ins:custom-profiles": {
      request: tuple([])
    },
    "inf:sign-ins:custom-review": {
      request: tuple([
        string().max(4096),
        customNetworkModeSchema,
        string().max(65536).optional()
      ])
    },
    "inf:sign-ins:custom-connect": {
      request: tuple([customApiConnectInputSchema])
    },
    "inf:sign-ins:custom-check": {
      request: tuple([string().min(1).max(128), string().min(1).max(256)])
    },
    "inf:sign-ins:custom-discover": {
      request: tuple([string().min(1).max(128)])
    },
    "inf:sign-ins:custom-cancel": {
      request: tuple([string().min(1).max(128)])
    },
    "inf:sign-ins:custom-save": {
      request: tuple([string().min(1).max(128), boolean()])
    },
    "inf:sign-ins:custom-recheck": {
      request: tuple([string().min(1).max(256)])
    },
    /**
     * What each of the home's connections that this computer approved one of
     * its own from says now, from the contract change
     * `custom-connection-from-home`: whole each time, so one left out is gone
     * from the home. No key or secret header value crosses.
     */
    "inf:sign-ins:custom-definitions": {
      request: tuple([array(customHomeDefinitionSchema).max(32)])
    },
    /**
     * Turns one of that computer's own accounts' Keep going on credits switch
     * on or off (docs/quota.md), saved only there, from the contract change
     * `computer-keep-going`. Only the account id and the switch cross; its
     * rows reach the home as that computer's sign-ins, whole.
     */
    "inf:sign-ins:keep-going": {
      request: tuple([object({ accountId: string().min(1).max(256), on: boolean() })])
    },
    /**
     * Renames, pauses or resumes, and prefers one of that computer's own
     * accounts, saved only there, from the contract change
     * `computer-account-settings`. Its rows reach the home as that computer's
     * sign-ins, whole, so its routing there reads the same switch and pin.
     */
    "inf:sign-ins:rename": {
      request: tuple([
        object({
          accountId: string().min(1).max(256),
          label: string().min(1).max(ACCOUNT_LABEL_MAX)
        })
      ])
    },
    "inf:sign-ins:set-enabled": {
      request: tuple([object({ accountId: string().min(1).max(256), enabled: boolean() })])
    },
    /** One account per provider crew work prefers there; null clears it. */
    "inf:sign-ins:pin": {
      request: tuple([
        object({
          providerId: string().min(1).max(256),
          accountId: string().min(1).max(256).nullable()
        })
      ])
    },
    /**
     * Uses one of that computer's own Codex accounts' saved resets there
     * (docs/codex-client.md), from the contract change `use-saved-reset`. It
     * answers once it has started; with `signIn`, Codex may sign in to the
     * account, its link and paste-back prompt coming as `inf:work:sign-in`
     * steps, and the end is a `signed-in` step carrying `savedReset`.
     */
    "inf:sign-ins:use-saved-reset": {
      request: tuple([
        object({
          signInId: signInIdSchema,
          accountId: string().min(1).max(256),
          signIn: boolean()
        })
      ])
    },
    /**
     * Turns that computer's own Codex account's Use saved resets on their own
     * on or off there (docs/quota.md, "Saved resets on their own"), from the
     * contract change `auto-saved-resets`. It answers once it has started;
     * turning it on with `signIn` lets Codex sign in to the account first, its
     * link and paste-back prompt coming as `inf:work:sign-in` steps, and the
     * end is a `signed-in` step once the switch is saved.
     */
    "inf:sign-ins:use-saved-resets": {
      request: tuple([
        object({
          signInId: signInIdSchema,
          accountId: string().min(1).max(256),
          on: boolean(),
          signIn: boolean()
        })
      ])
    },
    /**
     * Reads every account's allowance there now, rather than at its next
     * tick (`computer-account-settings`); the reading reaches the home as
     * that computer's sign-ins, whole, and this answers once it is read.
     */
    "inf:sign-ins:read-allowance": {
      request: tuple([])
    }
  });
  ({
    "inf:work:sign-in": {
      request: tuple([object({ signInId: signInIdSchema, step: signInStepSchema })])
    },
    "inf:work:sign-ins": {
      request: tuple([computerSignInsSchema])
    }
  });
  const deviceSignInFlowSchema = object({
    signInId: signInIdSchema,
    deviceId: string(),
    providerId: string(),
    accountId: string().optional(),
    target: _enum(["account", "forge"]),
    notice: authNoticeSchema.optional(),
    link: string().optional()
  }).and(
    discriminatedUnion("phase", [
      object({
        phase: literal("running"),
        prompt: authPromptSchema.optional(),
        ended: never().optional()
      }),
      object({
        phase: literal("ended"),
        prompt: never().optional(),
        ended: signInStepSchema.options[2]
      })
    ])
  );
  object({
    /** Window contact, independent of work reach; absent for work-only computers. */
    controlling: boolean().optional(),
    workSetup: deviceWorkSetupSchema.optional(),
    heldOnLocalNetwork: boolean().optional(),
    deviceId: string(),
    /** Its own name, as it joined (`docs/devices.md`). */
    name: string(),
    /** The macOS user it runs as, for one that runs as another user on this Mac. */
    user: string().optional(),
    onThisMac: boolean(),
    reach: computerReachSchema,
    /** It is being updated (`DeviceView.updating`): its words say updating rather than out of reach. */
    updating: literal(true).optional(),
    /** What it last said, or null before it said anything since this home started. */
    signIns: computerSignInsSchema.nullable(),
    /** When it last said it, in ms since the epoch. */
    asOf: number().optional(),
    /** It was asked and did not answer: its version may not sign in from here. */
    unanswered: boolean().optional(),
    /**
     * It speaks the custom API orders (`CUSTOM_API_SIGN_INS_SINCE`). Absent
     * means it does not, so the chip stays disabled.
     */
    customApi: boolean().optional(),
    /**
     * It approves a connection of the home's own and follows its later edits
     * (the contract change `custom-connection-from-home`). Absent means it
     * does not, so the home's connections offer no Use on it.
     */
    customFromHome: boolean().optional(),
    /**
     * It takes Keep going on credits for its own accounts (the contract change
     * `computer-keep-going`). Absent means it does not, so the item stays dim.
     */
    keepGoing: boolean().optional(),
    /**
     * It renames, pauses and prefers its own accounts and reads its allowance
     * on request (the contract change `computer-account-settings`). Absent
     * means it does not, so those items stay dim.
     */
    accountSettings: boolean().optional(),
    /**
     * It uses its own Codex accounts' saved resets there (the contract change
     * `use-saved-reset`). Absent means it does not, so the item is not offered.
     */
    savedReset: boolean().optional(),
    /**
     * It takes Use saved resets on their own for its own Codex accounts (the
     * contract change `auto-saved-resets`). Absent means it does not, so the
     * item stays dim.
     */
    autoSavedResets: boolean().optional(),
    /** Active sign-ins and failures awaiting Done; absent on an older home. */
    flows: array(deviceSignInFlowSchema).optional()
  });
  object({
    signInId: signInIdSchema,
    deviceId: string(),
    /** The provider, or for a sign-in where projects live, its host ("github.com"). */
    providerId: string(),
    /** The account signing in again, when it is not a new one. */
    accountId: string().optional(),
    step: signInStepSchema
  });
  function signInPlace(device) {
    const user = device.onThisMac && device.user ? userDisplayName(device.user) : void 0;
    return {
      label: deviceLabel(device),
      where: user ? `as ${user}` : `on ${device.name}`,
      who: user ?? device.name,
      said: {
        label: user ? { m: "placeRunningAs", a: { user } } : device.name,
        where: user ? { m: "placeAs", a: { user } } : { m: "placeOn", a: { computer: device.name } },
        who: user ?? device.name
      }
    };
  }
  function wordedPlace(place) {
    const word = (fill) => {
      if (typeof fill === "string") return fill;
      switch (fill.m) {
        case "placeOn":
          return placeOn(fill.a);
        case "placeAs":
          return placeAs(fill.a);
        case "placeRunningAs":
          return placeRunningAs(fill.a);
        case "placeOnOther":
          return placeOnOther();
        case "placeOther":
          return placeOther();
      }
    };
    return {
      label: word(place.said.label),
      where: word(place.said.where),
      who: word(place.said.who)
    };
  }
  function devicePlace(devices, deviceId) {
    const device = devices.find((entry) => entry.id === deviceId);
    if (device)
      return signInPlace({
        name: device.name,
        user: device.user,
        onThisMac: device.onThisMac ?? false
      });
    const other = { m: "placeOther" };
    return {
      label: `The other ${COMPUTER.one}`,
      where: `on the other ${COMPUTER.one}`,
      who: `The other ${COMPUTER.one}`,
      said: { label: other, where: { m: "placeOnOther" }, who: other }
    };
  }
  const placementSystemSchema = _enum(["macos", "linux"]);
  const workSystemSchema = _enum(["macos", "linux", "windows"]);
  const placementProfileSchema = _enum(["conversation", "standard", "heavy"]);
  const placementRequirementsSchema = strictObject({
    systems: array(placementSystemSchema).min(1).max(2).optional(),
    chips: array(deviceChipSchema).min(1).max(2).optional(),
    tools: array(string().regex(/^[A-Za-z0-9][A-Za-z0-9._+-]{0,79}$/)).max(32).optional(),
    profile: placementProfileSchema.optional()
  });
  const placementInheritedSchema = _enum(["systems", "chips"]);
  const placementRejectionSchema = _enum([
    "requirements-invalid",
    "out-of-reach",
    "older-firstmate",
    "work-disabled",
    "bound-elsewhere",
    "platform-unknown",
    "system-incompatible",
    "chip-incompatible",
    "tool-unknown",
    "tool-unavailable",
    "project-unknown",
    "project-unavailable",
    "model-unknown",
    "model-unavailable",
    "model-floor",
    "physical-computer-unknown",
    "resources-unknown",
    "resources-stale",
    "resources-invalid",
    "reservations-invalid",
    "memory-unavailable",
    "cpu-busy",
    "memory-busy",
    "model-preferred-elsewhere"
  ]);
  const AUTOMATIC_COMPUTER = "automatic";
  const factSchema = _enum(["available", "unavailable", "unknown"]);
  const RESOLVED_TOOL_LIMIT = 65;
  strictObject({
    tools: array(placementRequirementsSchema.shape.tools.unwrap().element).max(RESOLVED_TOOL_LIMIT),
    /** The exact project's origin, stripped of embedded sign-in material. */
    origin: string().min(1).max(4096).optional()
  });
  const placementFactsSchema = object({
    system: workSystemSchema.optional(),
    chip: deviceChipSchema.optional(),
    /**
     * Hash of the system identity of the computer its readings measure, a virtual
     * machine's own, common to every user; unknown fails closed.
     */
    physicalComputerId: string().regex(/^[a-f0-9]{64}$/).nullable(),
    tools: record(string(), factSchema),
    projectAccess: factSchema
  });
  placementFactsSchema.extend({
    /** Actual identities served by this computer's own accounts, never the home's catalog. */
    signIns: computerSignInsSchema.nullable()
  });
  const demandSchema = object({
    cpu: number().nonnegative(),
    memoryBytes: number().int().nonnegative()
  });
  const modelSchema = object({ provider: string().max(256), id: string().max(256) });
  const placementSnapshotSchema = object({
    version: literal(1),
    at: number(),
    computerId: string().nullable(),
    computerName: string().max(256),
    physicalComputerId: string().regex(/^[a-f0-9]{64}$/),
    orderId: string().min(1).max(128),
    origin: string().max(4096).optional(),
    /** Present only when an answered basis changed the ordinary placement winner. */
    basis: object({
      taskId: string(),
      taskKey: string(),
      computerId: string().nullable()
    }).optional(),
    /**
     * Present when the decision model picked this computer, reading the
     * person's standing directions (`src/core/placed/computerChoice.ts`), with
     * the model that answered. Absent when the ordinary rules chose.
     */
    picked: object({ source: string().max(256).optional() }).optional(),
    demand: demandSchema,
    model: modelSchema,
    acceptedFallback: boolean(),
    requirements: placementRequirementsSchema.extend({
      tools: array(placementRequirementsSchema.shape.tools.unwrap().element).max(RESOLVED_TOOL_LIMIT),
      /** The platform fields filled from the home's own; absent on a historical snapshot. */
      inherited: array(placementInheritedSchema).max(2).optional()
    }),
    candidateCount: number().int().positive(),
    candidates: array(
      object({
        computerId: string().nullable(),
        name: string().max(256),
        physicalComputerId: string().regex(/^[a-f0-9]{64}$/).nullable(),
        rejections: array(placementRejectionSchema).max(32),
        /** The core's one reach reading when it was compared; absent for this Mac and on a historical row. Out of reach reads connecting while it was connecting. */
        reach: computerReachSchema.optional(),
        /** It was being updated when it was compared (`DeviceView.updating`); absent otherwise. */
        updating: literal(true).optional(),
        missingTools: array(string().max(80)).max(RESOLVED_TOOL_LIMIT),
        /** What its fresh reading said it runs; absent when unread and on a historical row. */
        system: deviceSystemSchema.optional(),
        chip: deviceChipSchema.optional(),
        reading: computerResourceReadingSchema,
        factsAgeMs: number().nonnegative().nullable(),
        capacity: demandSchema.nullable(),
        reserved: demandSchema,
        remaining: demandSchema.nullable(),
        model: modelSchema.nullable(),
        preferenceRank: number().nonnegative().nullable()
      })
    ).max(64)
  });
  object({
    snapshot: placementSnapshotSchema,
    /** Pending until a proven end, or a later observation includes running demand. */
    reservation: _enum(["pending", "observed", "ended"]),
    /** Written before asynchronous preparation, so closing an unsent start is provably safe. */
    preparationStarted: boolean().optional()
  });
  const placementWaitKindSchema = _enum(["model", "room", "other"]);
  object({
    kind: placementWaitKindSchema,
    words: string(),
    /** When this kind of placement wait began; unchanged by fresh resource readings. */
    since: number().optional()
  });
  object({
    from: string().min(1),
    to: string().min(1),
    by: _enum(["captain", "firstmate"]),
    at: number(),
    phase: _enum(["waiting", "moving", "retiring", "undoing"]),
    fromDir: string().optional(),
    restartFrom: string().optional(),
    preparing: literal(true).optional(),
    keep: array(string().min(1).max(4096)).max(256).optional(),
    away: object({ head: string().min(1), at: number().optional() }).optional(),
    problem: string().optional()
  });
  object({ sha: string().min(1), at: number() });
  object({
    from: string().min(1),
    head: string().min(1),
    at: number(),
    kept: object({
      sha: string().min(1).optional(),
      ref: string().min(1).optional(),
      folder: string().min(1).optional(),
      at: number(),
      removed: number().optional()
    }).optional(),
    told: literal(true).optional()
  });
  const rigorSchema = _enum(["quick", "standard", "reviewed"]);
  _enum(["pass", "findings", "blocked"]);
  _enum(["low", "medium", "high"]);
  const findingSeveritySchema = _enum(["error", "warning", "info"]);
  const findingActionSchema = _enum(["auto-fix", "ask-user", "no-op"]);
  object({
    id: string().trim().min(1).max(64),
    severity: findingSeveritySchema,
    file: string().trim().min(1).optional(),
    line: number().int().min(1).optional(),
    text: string().trim().min(1).max(4e3),
    action: findingActionSchema
  });
  const repoSetupKindSchema = _enum(["clone", "init", "adopt"]);
  const projectKeyChoiceSchema = string().trim().min(1).max(16);
  const projectJoinSchema = string().trim().min(1).max(16);
  discriminatedUnion("kind", [
    strictObject({
      kind: literal("clone"),
      origin: string().trim().min(1),
      name: string().optional(),
      key: projectKeyChoiceSchema.optional(),
      project: projectJoinSchema.optional()
    }),
    strictObject({
      kind: literal("init"),
      name: string().trim().min(1),
      key: projectKeyChoiceSchema.optional(),
      project: projectJoinSchema.optional()
    }),
    strictObject({
      kind: literal("adopt"),
      path: string().trim().min(1),
      name: string().optional(),
      key: projectKeyChoiceSchema.optional(),
      project: projectJoinSchema.optional()
    })
  ]);
  const repoKindSchema = _enum(["project", "personal"]);
  const repoDeliverySchema = _enum(["direct-pr", "queue-pr", "local-only"]);
  function opensPullRequest(delivery) {
    return delivery === "direct-pr" || delivery === "queue-pr";
  }
  const repoHostSchema = object({
    kind: _enum(["github", "gitlab", "bitbucket", "git"]),
    name: string().nullable()
  }).nullable();
  function hostTakesBatches(host) {
    const server = serverFactsAt(host?.kind, host?.name);
    return server ? server.batches : changeRequestHost(host?.kind)?.batches ?? false;
  }
  function readsPullRequestChecks(repo) {
    return repo.kind !== "personal" && opensPullRequest(repo.delivery) && !!repo.origin && hasChangeRequests(repo.host?.kind);
  }
  function deliveryChoices(host, batchesOffered, delivery) {
    if (!host) return ["local-only"];
    return hostTakesBatches(host) && (batchesOffered || delivery === "queue-pr") ? ["local-only", "direct-pr", "queue-pr"] : ["local-only", "direct-pr"];
  }
  function projectDeliveryChoices(repo) {
    return deliveryChoices(
      repo.origin ? repo.host : void 0,
      repo.batchesOffered ?? true,
      repo.delivery
    );
  }
  const batchGapSchema = number().int().positive();
  object({
    contributionDestination: contributionDestinationSchema.optional(),
    placementRequirements: placementRequirementsSchema.nullable().optional(),
    delivery: repoDeliverySchema.optional(),
    autonomy: boolean().optional(),
    rigor: rigorSchema.nullable().optional(),
    costLimit: costLimitSchema.nullable().optional(),
    scope: string().nullable().optional(),
    name: string().trim().min(1).max(120).optional(),
    path: string().trim().min(1).max(4096).optional(),
    origin: string().trim().min(1).max(4096).nullable().optional(),
    /**
     * Settings → Projects' Require pull request checks (docs/forge.md, "A
     * project with no checks"): false records that the project runs no
     * checks, true ends that record.
     */
    requireChecks: boolean().optional(),
    /**
     * Settings → Projects' When a batch starts, for a batched project
     * (docs/forge.md, "The batch gap"): the least time in minutes from one
     * batch's start to the next, or null to start one as soon as a change is approved.
     */
    batchGap: batchGapSchema.nullable().optional(),
    /**
     * Settings → Projects' Disclose AI assistance (docs/forge.md, "Disclosing AI
     * assistance"): the line that opens what the crew posts to an
     * outside contributor, an empty string to post none, or null for the
     * default line.
     */
    contributorDisclosure: contributorDisclosureSchema.nullable().optional(),
    /**
     * Settings → Projects' Advisory workflows (docs/forge.md, "Advisory
     * workflows"): the workflow files whose checks never hold a merge; an
     * empty list names none.
     */
    advisoryWorkflows: advisoryWorkflowsSchema.optional(),
    /**
     * The address of the repository `advisoryWorkflows` was named for, as
     * the place naming it read the project: a save is refused once the
     * project uses another repository, however it was queued.
     */
    advisoryWorkflowsAt: string().max(4096).nullable().optional()
  }).strict().refine((patch) => Object.values(patch).some((value) => value !== void 0), {
    message: "pass delivery, autonomy, rigor, costLimit, scope, name, path, origin, requireChecks, batchGap, contributorDisclosure, advisoryWorkflows, or several"
  });
  const noChecksRecordSchema = object({
    at: number(),
    task: string().optional(),
    head: string().optional(),
    evidence: string().optional()
  });
  const repoViewSchema = object({
    id: string(),
    /** The fleet name (unique; names the fleet-root entry), shown in surfaces. */
    name: string(),
    /** What work belongs here, in the captain's words; personal takes no scope. */
    scope: string().nullable().optional(),
    /** The repo's real working directory (external for adopted repos). */
    path: string(),
    setupKind: repoSetupKindSchema,
    /**
     * The workspace's nature (`project` or `personal`), migration 37. There
     * is exactly one `personal` row - the app's own personal workspace - and
     * it takes no delivery, autonomy or rigor.
     */
    kind: repoKindSchema,
    /** Remote URL when known: the clone source, or a detected origin on adopt. */
    origin: string().nullable(),
    /** Where the project lives, read from `origin`; null = kept on this Mac. */
    host: repoHostSchema,
    contribution: contributionRouteSchema.optional(),
    /** A successful host inspection, including a direct route with no fork requirement. */
    contributionChecked: boolean().optional(),
    delivery: repoDeliverySchema,
    /** On = the agent may land green finished work on this repo by itself. */
    autonomy: boolean(),
    /**
     * The repository's standing delivery rigor (delivery rigor phase 3), set
     * by talking or Settings → Projects; null = the host derives it per task
     * from the posture and the intelligence tier (`rigorFor` in `./rigor.ts`).
     */
    rigor: rigorSchema.nullable(),
    /** Null follows Settings → Intelligence; absent on older homes. */
    costLimit: costLimitSchema.nullable().optional(),
    /**
     * Where the project's next task starts (multi-machine piece 11,
     * docs/helper.md "Runs on"): the id of a paired computer that runs work,
     * or null for this Mac.
     */
    runsOn: string().nullable(),
    placementRequirements: placementRequirementsSchema.optional(),
    /**
     * This person's line of approved changes and open batch in the project,
     * while there is either (docs/forge.md, "Batches of your own").
     */
    batch: batchRecordSchema.optional(),
    /**
     * The record that the project runs no pull request checks, while it has
     * one; absent, its changes' checks hold their merge (docs/forge.md, "A
     * project with no checks").
     */
    noChecks: noChecksRecordSchema.optional(),
    /**
     * The least time in minutes from one of this person's batches starting
     * to the next (docs/forge.md, "The batch gap"); absent, a batch starts as
     * soon as a change is approved. A held batch's repair never waits for it.
     */
    batchGap: batchGapSchema.optional(),
    /**
     * The project's own line opening what the crew posts to an outside
     * contributor, or an empty string for none (docs/forge.md, "Disclosing AI
     * assistance"); absent, the default line.
     */
    contributorDisclosure: contributorDisclosureSchema.optional(),
    /**
     * The project's advisory workflows, by file (docs/forge.md, "Advisory
     * workflows"): their checks show on every reading and hold nothing.
     * Absent, every check holds as read.
     */
    advisoryWorkflows: advisoryWorkflowsSchema.optional(),
    /**
     * Whether a runbook that is on at the home offers batched pull requests,
     * so the project may newly choose them (`deliveryChoices`); absent from an
     * older home, which offers them by host alone.
     */
    batchesOffered: boolean().optional()
  });
  object({
    repo: repoViewSchema,
    created: boolean(),
    initializedGit: boolean().optional(),
    createdInitialCommit: boolean().optional(),
    /**
     * The folder a removed project left in the projects folder, linked where it
     * is instead of cloning a second copy (docs/fleet.md, "Adding a removed
     * project back").
     */
    leftFolder: string().optional()
  });
  discriminatedUnion("kind", [
    object({ kind: literal("card"), cardId: string().min(1) }),
    object({ kind: literal("already"), name: string().min(1) })
  ]);
  union([
    string().trim().min(1),
    strictObject({ own: literal(true), key: string().trim().min(1).optional() })
  ]);
  object({
    project: object({ id: string(), key: string(), name: string() }),
    repos: array(object({ id: string(), name: string() })),
    tasks: number().int().nonnegative()
  });
  object({
    tasks: array(
      object({
        key: string(),
        title: string(),
        status: _enum(["planned", "working"])
      })
    )
  });
  object({
    path: string(),
    custom: boolean()
  });
  function runbooksSummary(books) {
    const usable = books.filter((book) => !book.error);
    const on = usable.filter((book) => book.enabled).length;
    const off = usable.length - on;
    return off > 0 ? `${on} on · ${off} off` : `${on} on`;
  }
  const REPLY_EMOTES = ["nod", "salute", "tick", "tuck", "aww"];
  const FIRSTMATE_EMOTES = [
    "greet",
    "celebrate",
    "ponder",
    "confused",
    "fidget",
    ...REPLY_EMOTES
  ];
  const EMOTE_WORDS_MAX = 40;
  function emoteWords(raw) {
    const text = (raw ?? "").replace(/\s+/gu, " ").replace(new RegExp("\\p{Cc}", "gu"), "").replace(/ {2,}/g, " ").trim();
    if (!text) return { kind: "none" };
    const length = [...text].length;
    return length > EMOTE_WORDS_MAX ? { kind: "too-long", length } : { kind: "words", text };
  }
  const THROUGH_THE_COMMAND = "command";
  const throughSchema = literal(THROUGH_THE_COMMAND);
  const lastTurnEligibilitySchema = _enum(["completed", "queued"]);
  const lastTurnReplySchema = object({
    text: string(),
    /** The turn failed or paused: the line says what went wrong, in plain words. */
    problem: boolean().optional(),
    /** Typed, never inferred from the words. Absent is unknown, and the line stays. */
    eligibility: lastTurnEligibilitySchema.optional(),
    /**
     * The captain took the message back before any turn read it, so nothing
     * answered it (docs/task-capture.md, "Taking back a message"). The window
     * words the line from this in its own language when it shows it; `text`
     * keeps the same catalog words in English for a reader that words nothing
     * itself (docs/i18n.md, "Saved facts").
     */
    withdrawn: literal(true).optional(),
    /**
     * The Firstmate's closing words as it wrote them, line breaks kept, when
     * they differ from the one-line `text`: the conversation shows them
     * (docs/composer.md "The conversation"). Absent, it shows `text`.
     */
    words: string().optional()
  });
  const lastRoundSchema = object({
    /** The captain's words; empty for a message that was only pictures. */
    you: string(),
    /** The Firstmate's reply line, or null while none has been given. */
    reply: lastTurnReplySchema.nullable(),
    /** The message came from the captain's own command, `infinitary-axi`, not the window. */
    through: throughSchema.optional(),
    /** The message's id, which a take back names; absent from an older core. */
    askId: string().optional(),
    /**
     * When the core accepted the message, in ms since the epoch: the take-back
     * window runs from it (`TAKE_BACK_WINDOW_MS`). Absent from an older core.
     */
    sentAt: number().optional(),
    /** The captain took the message back (docs/task-capture.md, "Taking back a message"). */
    takenBack: literal(true).optional()
  });
  lastRoundSchema.extend({
    previous: lastRoundSchema.nullable().optional()
  });
  const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];
  strictObject({
    id: string().min(1).max(64),
    kind: _enum(["image"]),
    name: string().max(120),
    mimeType: _enum(IMAGE_TYPES),
    bytes: number().int().nonnegative(),
    sha256: string().length(64),
    /** The copy's path relative to the attachments folder: `<message id>/<file>`. */
    file: string().min(1).max(200)
  });
  discriminatedUnion("kind", [
    object({ kind: literal("regular"), path: string().min(1).max(4096) }),
    object({ kind: literal("no-path") }),
    /** A folder, with its path: the main message box offers it as a project (docs/composer.md, "Files"). */
    object({ kind: literal("folder"), path: string().min(1).max(4096).optional() }),
    object({ kind: literal("shortcut") }),
    object({ kind: literal("other") })
  ]);
  discriminatedUnion("kind", [
    object({
      kind: literal("image"),
      name: string().max(120),
      mimeType: _enum(IMAGE_TYPES),
      data: _instanceof(Uint8Array)
    }),
    object({
      kind: literal("text"),
      name: string().max(120),
      data: _instanceof(Uint8Array)
    }),
    /** An unsupported format: only its path comes back, for the composer to type. */
    object({
      kind: literal("unsupported"),
      name: string().max(120),
      path: string().min(1).max(4096)
    }),
    object({ kind: literal("too-big"), name: string().max(120), image: boolean() }),
    object({ kind: literal("folder"), name: string().max(120) }),
    object({ kind: literal("shortcut"), name: string().max(120) }),
    object({ kind: literal("unreadable"), name: string().max(120) })
  ]);
  const remoteLoginAddressSchema = string().trim().min(1).max(255).regex(
    /^(?:(?:[A-Za-z0-9_][A-Za-z0-9_.-]{0,63}@)?[A-Za-z0-9_[][A-Za-z0-9_.:%[\]-]{0,190}|ssh:\/\/(?:[A-Za-z0-9_][A-Za-z0-9_.-]{0,63}@)?(?:[A-Za-z0-9_][A-Za-z0-9_.-]{0,190}|\[[A-Za-z0-9:.%]{2,64}\]):[1-9][0-9]{0,4})$/
  );
  const remoteLoginStageSchema = _enum([
    "reaching",
    "setting-up",
    "finding",
    "updating",
    "removing",
    "done",
    "refused"
  ]);
  const remoteLoginCopySchema = object({
    state: _enum(["preparing", "sending", "starting"]),
    sent: number().int().nonnegative().optional(),
    /** A separately downloaded file, whose total is only present when the release states it. */
    download: object({
      received: number().int().nonnegative(),
      total: number().int().positive().optional()
    }).optional()
  });
  const remoteLoginRefusalSchema = _enum([
    "key-locked",
    "agent-declined",
    "agent-not-running",
    "key-refused",
    "password-off",
    "password-wrong",
    "key-not-taken",
    "remote-login-off",
    "unreachable",
    "host-unknown",
    "host-changed",
    "other-system",
    "needs-tools",
    "sandbox-off",
    "cannot-install",
    "no-build",
    "build-unverified",
    "already-joined",
    "still-answers",
    "in-reach",
    "same-user",
    "cannot-send",
    "not-set-up",
    "busy",
    "forwarding-refused",
    "another-computer",
    "failed",
    "out-of-reach",
    "not-updatable",
    "current"
  ]);
  const backgroundStateSchema = _enum([
    "running",
    "at-login",
    "failed",
    "none",
    "unavailable",
    "unknown"
  ]);
  discriminatedUnion("firstmate", [
    strictObject({
      firstmate: literal("joined"),
      background: backgroundStateSchema,
      /**
       * It left another Firstmate first, as the home's captain agreed (`leave`):
       * how many working copies it kept for their unmerged work, and how many
       * things it could not remove.
       */
      left: strictObject({
        kept: number().int().nonnegative().max(64),
        unremoved: number().int().nonnegative().max(64)
      }).optional()
    }),
    strictObject({ firstmate: literal("updated"), background: backgroundStateSchema }),
    strictObject({
      firstmate: literal("removed"),
      kept: array(string().max(4096)).max(64),
      /** Kept because its work history could not be read, not known to be empty. */
      unreadable: array(string().max(4096)).max(64).optional(),
      /** What it meant to remove and could not yet. */
      unremoved: array(string().max(4096)).max(64).optional()
    }),
    strictObject({ firstmate: literal("refused"), reason: string().min(1).max(64) })
  ]);
  strictObject({
    /** The captain agreed to leave the other Firstmate that user runs work for. */
    leave: literal(true).optional(),
    /**
     * The check line the captain said was that Mac. Absent, a Mac this Mac has
     * not checked answers the question instead of signing in.
     */
    confirm: string().min(1).max(160).optional(),
    /**
     * That user's password there, typed once by the captain after the Mac did
     * not let the captain's key in (docs/devices.md, "The password, once").
     * Firstmate types it only to let its own key in, after the check line, and
     * keeps none of it.
     */
    password: string().min(1).max(1024).optional()
  });
  const remoteLoginPasswordQuestionSchema = strictObject({
    asks: literal("password"),
    address: string().min(1).max(255),
    user: string().min(1).max(64).optional(),
    wrong: literal(true).optional(),
    for: _enum(["install", "update"]).optional(),
    deviceId: string().min(1).max(64).optional()
  });
  strictObject({
    refused: remoteLoginRefusalSchema,
    lines: array(string().max(1024)).max(4),
    /** The change there may already have happened, so nothing offers to try it again. */
    uncertain: literal(true).optional()
  });
  const remoteLoginConfirmQuestionSchema = strictObject({
    asks: literal("confirm"),
    address: string().min(1).max(255),
    line: string().min(1).max(160)
  });
  union([
    deviceViewSchema,
    strictObject({
      asks: literal("leave"),
      address: string().min(1).max(255),
      name: string().min(1).max(255).optional()
    }),
    remoteLoginConfirmQuestionSchema,
    remoteLoginPasswordQuestionSchema
  ]);
  strictObject({
    asks: literal("package-address"),
    address: remoteLoginAddressSchema.optional(),
    /** Why the address tried on its own was refused, said above it so it can be corrected. */
    lines: array(string().max(1024)).max(4).optional()
  });
  strictObject({
    password: string().min(1).max(1024).optional(),
    address: remoteLoginAddressSchema.optional(),
    confirm: string().min(1).max(160).optional(),
    packageFallback: literal(true).optional()
  });
  const remoteLoginDoingSchema = _enum(["add", "update", "remove", "address"]);
  const accountHoldSchema = object({
    class: _enum(CUT_OFF_CLASSES),
    provider: string(),
    resetsAt: number().optional(),
    /**
     * Where the account is, for a task on a computer that runs work, which
     * runs on that computer's own sign-in ("on Mac mini", "as Builder");
     * absent for this Mac's own.
     */
    where: string().optional()
  });
  const workPostureSchema = object({
    state: _enum(["active", "idle", "paused", "unknown"]),
    reason: _enum([
      "turn",
      "job",
      "checks",
      "guidance",
      "settlement",
      "timed-wait",
      "captain",
      "inactive",
      "access",
      "dependency",
      "unobserved"
    ]),
    /** Present on `access` while a typed cut-off stands on the task's account. */
    hold: accountHoldSchema.optional(),
    /**
     * A crewmate failing at its provider (docs/inbox.md): `retrying` on the
     * guidance posture while the app retries on its own, `stuck` once the same
     * refusal stopped the retry. Older views ignore it and keep the reason's words.
     */
    atProvider: _enum(["retrying", "stuck"]).optional(),
    /** Pending batch status on the offered version; older views keep their checks look. */
    batch: _enum(["waiting", "in-batch", "paused"]).optional(),
    /** The watched contribution is open with its upstream maintainers. */
    maintainers: boolean().optional()
  });
  const usageCostSourceSchema = _enum(["listed-prices", "claude", "reported"]);
  const usageCountsSchema = object({
    input: number().optional(),
    output: number().optional(),
    cacheRead: number().optional(),
    cacheWrite: number().optional(),
    /** Reported thinking tokens, already included in output; never add to totals. */
    reasoning: number().optional(),
    cost: number().optional(),
    /** The estimate by token category, where the session priced each one apart. */
    costParts: object({
      input: number().optional(),
      output: number().optional(),
      cacheRead: number().optional(),
      cacheWrite: number().optional()
    }).optional(),
    costSource: usageCostSourceSchema.optional()
  });
  const usageSchema = usageCountsSchema.extend({
    /**
     * Each model that served the turn, with its own share, when the session
     * names them (Claude does: a turn can call several). The counts above are
     * their sum.
     */
    models: array(usageCountsSchema.extend({ model: string().min(1) })).optional()
  });
  const cutOffSchema = object({
    class: _enum(CUT_OFF_CLASSES),
    resetsAt: number().optional()
  });
  const taskStatusSchema = _enum(["completed", "cancelled", "failed"]);
  const feedRunSchema = object({ id: string(), withdrawn: boolean().optional() });
  discriminatedUnion("type", [
    object({
      type: literal("task_started"),
      taskId: string(),
      title: string(),
      machineId: string(),
      crewmate: string()
    }),
    object({ type: literal("assistant_delta"), taskId: string(), text: string() }),
    object({ type: literal("thinking_delta"), taskId: string(), text: string() }),
    object({
      type: literal("tool_start"),
      taskId: string(),
      callId: string(),
      toolName: string()
    }),
    object({
      type: literal("tool_end"),
      taskId: string(),
      callId: string(),
      toolName: string(),
      isError: boolean(),
      /** Usage reported by model-powered tool work, separate from a conversational turn. */
      usage: usageSchema.optional()
    }),
    object({ type: literal("turn_end"), taskId: string(), usage: usageSchema.optional() }),
    /**
     * A turn that ended in a provider error (Pi resolves these instead of
     * throwing, so without this event the failure would be invisible). The
     * supervisor enriches crewmate ones with the crewmate name and task title.
     */
    object({
      type: literal("turn_failed"),
      taskId: string(),
      error: string(),
      /**
       * The typed cut-off behind the failure, when the backend reported one
       * in its own fields (docs/quota.md "Typed cut-offs"). Absent on an
       * ordinary failure, and on every failure from a backend that reports
       * prose only.
       */
      cutOff: cutOffSchema.optional(),
      /** The backend exhausted its own context-length recovery. */
      contextOverflow: literal(true).optional(),
      /**
       * The Firstmate's seat paused on this cut-off: its pause line and card
       * speak for the failure. Absent when the cut-off paused nothing (a
       * spent allowance with no known reset), which is an ordinary failure.
       */
      paused: boolean().optional(),
      crewmate: string().optional(),
      title: string().optional()
    }),
    object({
      type: literal("task_finished"),
      taskId: string(),
      status: taskStatusSchema,
      error: string().optional(),
      title: string().optional()
    }),
    object({
      type: literal("task_report"),
      taskId: string(),
      title: string(),
      crewmate: string(),
      /** First sentence of the report, capped, for the feed line. */
      summary: string().optional()
    }),
    /** A finished task's branch was merged locally (Q5, forge-agnostic). */
    object({
      type: literal("task_landed"),
      taskId: string(),
      title: string(),
      mode: _enum(["fast-forward", "merge"])
    }),
    object({ type: literal("auth_reconnect_required"), providerId: string() }),
    /** The fleet changed (agent-operated); display surfaces refresh on these. */
    object({
      type: literal("repo_setup"),
      actor: _enum(["captain", "firstmate"]).optional(),
      repoId: string(),
      name: string(),
      path: string(),
      kind: repoSetupKindSchema,
      /** The project it joined, by name, when that project holds another repository (INF-4220). */
      project: string().optional()
    }),
    object({
      type: literal("repo_configured"),
      /** Exact name, folder or approved address change, when one changed. */
      description: string().optional(),
      /**
       * The line as a fact, worded where it is shown, when the app itself
       * started or ended the project's no-checks record; `description` is its
       * English (docs/i18n.md, "Saved facts").
       */
      said: saidSchema.optional(),
      actor: _enum(["captain", "firstmate"]).optional(),
      /** The panel the captain changed it in, by its title (docs/ui-plugins.md, "Changing settings"). */
      panel: string().optional(),
      repoId: string(),
      name: string(),
      delivery: repoDeliverySchema,
      autonomy: boolean(),
      /** The standing rigor the repository now declares; null = derived (phase 3). */
      rigor: rigorSchema.nullable()
    }),
    object({
      type: literal("repo_unregistered"),
      actor: _enum(["captain", "firstmate"]).optional(),
      repoId: string(),
      name: string()
    }),
    /**
     * A project's batch changed (docs/forge.md, "Batches of your own"): the
     * changes in line, the open batch or its hold. Settings reads the project
     * again; no feed line.
     */
    object({
      type: literal("repo_batch"),
      repoId: string()
    }),
    /**
     * A project's open batch's checks read differently, or went with the
     * batch (docs/forge.md, "The Batches panel"): the Batches panel reads it
     * again; no feed line. The reading is kept in memory, never on the record.
     */
    object({
      type: literal("batch_checks"),
      repoId: string()
    }),
    /**
     * Which runbooks are on may have changed: a switch, a copy, an added or
     * removed runbook, or a built-in turned back on for an offer in use
     * (docs/runbooks.md, "Panels"). A window reads the runbooks again for the
     * panels a built-in runbook shows; no feed line.
     */
    object({
      type: literal("runbooks_changed")
    }),
    /**
     * A project's Runs on changed (docs/helper.md, "Runs on"): where its next
     * task starts, a computer that runs work by its id or null for this Mac.
     * `text` is the whole feed line, in the design skill's words.
     */
    object({
      type: literal("repo_runs_on"),
      actor: _enum(["captain", "firstmate"]).optional(),
      /** The panel the captain changed it in, by its title (docs/ui-plugins.md, "Changing settings"). */
      panel: string().optional(),
      repoId: string(),
      name: string(),
      runsOn: string().nullable(),
      text: string(),
      /** The line as a fact, worded where it is shown; `text` is its English (docs/i18n.md, "Saved facts"). */
      said: saidSchema.optional()
    }),
    /**
     * A device used its link and is on the home's list (docs/devices.md).
     * `name` is the device's own words, drawn as text; nothing of the link
     * rides it. A computer that runs work adds the macOS user it runs as,
     * whether it is another user on this Mac, and what it said it has there.
     * `again`: a device already on the list used the link to find this Mac
     * where it is now, and stays as it was (docs/devices.md, "Finding the
     * home again").
     */
    object({
      type: literal("device_joined"),
      deviceId: string(),
      name: string(),
      kind: deviceKindSchema,
      user: string().optional(),
      onThisMac: boolean().optional(),
      found: foundToolsSchema.optional(),
      again: boolean().optional(),
      /** Where it reached this computer, when the socket says. */
      reachedOn: _enum(["local", "private"]).optional()
    }),
    /**
     * A step of adding a Mac by its address, updating Firstmate there, or
     * removing what Firstmate set up there, over Remote Login (docs/devices.md,
     * "Adding a computer by its address"). `text` is the whole feed line, in the
     * design skill's words; a refusal is two of them, each `warn`. `stage`
     * and `deviceId` are typed facts Settings -> Devices follows; nothing of a
     * link rides it.
     */
    object({
      type: literal("device_setup"),
      address: string(),
      doing: remoteLoginDoingSchema,
      stage: remoteLoginStageSchema,
      /** The other Mac's own name, once the home heard it. */
      name: string().optional(),
      deviceId: string().optional(),
      text: string(),
      tone: _enum(["info", "warn"]),
      /** How far the copy of Firstmate has gone there, while it is set up or found again. */
      copy: remoteLoginCopySchema.optional(),
      /**
       * The run of lines this one belongs to (`feedRunSchema`): each later
       * count of the copy sent so far rewrites the line before it.
       */
      run: feedRunSchema.optional()
    }),
    /**
     * A change in this Mac's own SSH connection to a computer it added by its
     * address, said once (docs/devices.md, "Through the home's SSH"): it
     * stopped trying until Try again, came back after that, the work there
     * could not start, or this Mac gave up removing what it set up on one it
     * removed. Nothing secret rides it.
     */
    object({
      type: literal("device_connection"),
      deviceId: string(),
      name: string(),
      state: _enum(["stopped", "connected", "not-started", "gave-up"]),
      text: string(),
      tone: _enum(["info", "warn"])
    }),
    /**
     * One step of updating Firstmate on a computer that runs work over the
     * connection (docs/devices.md, "Updating over the connection"): what the
     * feed says, and each refusal's two `warn` lines. Nothing secret rides it.
     */
    object({
      type: literal("device_update"),
      deviceId: string(),
      name: string(),
      stage: _enum(["updating", "done", "refused"]),
      text: string(),
      tone: _enum(["info", "warn"]),
      /**
       * How far Firstmate has gone there (docs/devices.md, "Downloading over
       * the connection"): its download's count, this computer's send's, or
       * starting it again.
       */
      copy: remoteLoginCopySchema.optional(),
      /** The run of lines this one belongs to (`feedRunSchema`): each later count rewrites the line before it. */
      run: feedRunSchema.optional()
    }),
    /**
     * A device's person chose Leave on it, and it is off the home's list
     * (docs/devices.md, "Leave"). `name` is the device's own words.
     */
    object({
      type: literal("device_left"),
      deviceId: string(),
      name: string(),
      kind: deviceKindSchema
    }),
    /**
     * A paired computer out of reach when Infinitary was reset came back and
     * heard it was removed, or stayed out of reach for the 30 days the reset
     * waits (docs/reset.md, "Computers out of reach"). `name` is how the old
     * first mate's list named it.
     */
    object({
      type: literal("device_reset_removal"),
      deviceId: string(),
      name: string(),
      outcome: _enum(["removed", "stayed"])
    }),
    /**
     * A computer that runs work signed in to one of its own subscriptions
     * (docs/helper.md, "Its own sign-ins"). `who` is how the home names it -
     * its own name, or the macOS user it runs as here - and `provider` the
     * subscription's name; nothing the captain typed rides it.
     */
    object({
      type: literal("device_signed_in"),
      deviceId: string(),
      who: string(),
      provider: string()
    }),
    /**
     * The captain signed a computer that runs work out of one of its own
     * subscriptions (Disconnect). For Claude, `login` is what became of that
     * computer's own Claude login: signed out when Firstmate made it there
     * from a pasted code, kept when it did not; absent when the computer did
     * not say.
     */
    object({
      type: literal("device_signed_out"),
      deviceId: string(),
      who: string(),
      provider: string(),
      login: machineLoginOutcomeSchema.optional()
    }),
    /**
     * A short FYI line from the Firstmate agent for the activity feed. One
     * that names its task is a row on that task's record, which the feed
     * reads back (docs/task-record.md, "What Activity holds"), so it never
     * reaches a client as itself.
     */
    object({
      type: literal("firstmate_note"),
      text: string(),
      taskId: string().optional(),
      /** A task-less host notice may carry a physical warning; older views still receive its text. */
      tone: _enum(["info", "warn"]).optional(),
      /** The note as a fact, worded where it is shown; `text` is its English (docs/i18n.md, "Saved facts"). */
      said: saidSchema.optional()
    }),
    /**
     * A character reaction, drained by the character renderer: one the
     * Firstmate asked for with its emote tool, or a reply emote the host fired
     * for a captain turn's steer (nod), note (tuck) or personalize (tick).
     * `text` is the emote's few words, already clean by the shared rule
     * (`emoteWords`): the Firstmate's own, or on a reply the host fired the
     * app's own words (`AUTOMATIC_EMOTE_WORDS`), marked `automatic`. The
     * window shows them only as the turn's reply line, which the core chooses
     * and sends as `firstmate_reply`.
     */
    object({
      type: literal("firstmate_emote"),
      emote: _enum(FIRSTMATE_EMOTES),
      text: string().refine((text) => {
        const words = emoteWords(text);
        return words.kind === "words" && words.text === text;
      }, "emote words must be clean and at most EMOTE_WORDS_MAX characters").optional(),
      automatic: literal(true).optional()
    }),
    /**
     * A durable note was written (create/revise/retire/restore). The text is
     * the feed body after "noted - "; the word memory never reaches the UI.
     */
    object({ type: literal("memory_noted"), text: string() }),
    /**
     * The Firstmate applied a preference on the captain's word (talk-to-
     * personalize Step 1: theme, a panel's rail or visibility, a surface
     * removed). One feed line, never a card; the
     * text is the whole line. Catalog actions stamp their actor; older events
     * without one retain the Firstmate personalization wording.
     */
    object({
      type: literal("personalized"),
      text: string(),
      actor: _enum(["captain", "firstmate"]).optional(),
      /** The panel the captain changed it in, by its title (docs/ui-plugins.md, "Changing settings"). */
      panel: string().optional(),
      /**
       * The captain's settled run this line belongs to (docs/orchestrator-contract.md,
       * "Settled runs"): a later step of the same run rewrites the run's line
       * in place while it is still Activity's newest, and `withdrawn` takes
       * the line away because the run came back where it started.
       */
      run: feedRunSchema.optional()
    }),
    /**
     * A closed card was brought forward as a read-only past card (FI3-579
     * piece 4, `inf:cards:show-past`). The shell opens its held entry; nothing
     * is stored and no card is raised.
     */
    object({ type: literal("past_card_shown"), cardId: string() }),
    /**
     * A card still on the stack was brought to its front (What's new,
     * `inf:release-notes:show`). The shell shows it; nothing is stored.
     */
    object({ type: literal("open_card_shown"), cardId: string() }),
    /**
     * The first mate opened a task's record in the captain's window
     * (`show-task`, `inf:tasks:show`). The shell opens it; nothing is stored.
     * A window from before ignores a type it does not know.
     */
    object({ type: literal("task_record_shown"), taskId: string() }),
    /**
     * The first mate opened Settings in the captain's window on a section and
     * what it shows (`show-settings`, `inf:settings:show`), as a panel's
     * `point.openSettings` does. Nothing is stored.
     */
    object({
      type: literal("settings_shown"),
      section: string(),
      item: string().optional()
    }),
    /**
     * A task's own browser changed for the captain (docs/task-browser.md, "The
     * view"): it opened, moved, acted or stopped. Per-task invalidation for
     * `tasks.detail`, which carries its fact; nothing is stored or shown.
     */
    object({ type: literal("task_browser"), taskId: string() }),
    /**
     * A write changed knowledge (docs/knowledge.md, "The browser"), or the
     * purge cleared it. Invalidation for the browser's reads; nothing is
     * stored or shown, and only an alpha or development build sends it.
     */
    object({ type: literal("knowledge_changed") }),
    /** The captain submitted a home-input turn (text and/or images). */
    object({
      type: literal("user_turn"),
      text: string(),
      /** Sent from the captain's own command, `infinitary-axi`, not the window. */
      through: throughSchema.optional(),
      /** The message's id, which a take back names (src/shared/lastTurn.ts). Absent from an older core. */
      askId: string().optional(),
      /** When the core accepted the message, in ms since the epoch. Absent from an older core. */
      sentAt: number().optional()
    }),
    /**
     * The Firstmate's reply line to the captain's last message, sent as the
     * turn that read it ends and before its busy signal falls (src/shared/
     * lastTurn.ts, docs/composer.md "The last turn"); the same line is kept
     * beside the message for the next launch.
     */
    object({
      type: literal("firstmate_reply"),
      text: string(),
      problem: boolean().optional(),
      /** Typed completion: absent is unknown, and the line stays. */
      eligibility: lastTurnEligibilitySchema.optional(),
      /** The closing words as written, when they differ from `text` (src/shared/lastTurn.ts). */
      words: string().optional(),
      /** Taken back before any turn read it (src/shared/lastTurn.ts). */
      withdrawn: literal(true).optional(),
      /**
       * The message the line stands beside: the newest, or one the captain
       * took back, whose undo the turn did or no turn read (docs/task-capture.md,
       * "Taking back a message"). Absent from an older core, and the line is the newest's.
       */
      askId: string().optional()
    }),
    /**
     * A task record changed (task-system P3): per-task invalidation for
     * `tasks.detail`. `seq` is the board sequence the change committed
     * under, the same one the next `inf:tasks` push carries. Emitted after
     * the commit, never from memory.
     */
    object({
      type: literal("task_changed"),
      taskId: string(),
      key: string(),
      kind: _enum(["work", "question", "decision", "operation"]),
      status: _enum(["open", "active", "done", "dropped"]),
      /**
       * The status the record carried before this change, as the emitter
       * last saw it; null for a row it had not seen. A status transition is
       * `from !== status` - the one thing a reaction (the character's emote,
       * P5) may key on, so a later write on a closed row never re-fires it.
       */
      from: _enum(["open", "active", "done", "dropped"]).nullable(),
      activity: _enum(["starting", "running", "idle", "interrupted"]).nullable(),
      workPosture: workPostureSchema.optional(),
      /**
       * A work task's served slot as the board reads it (`TaskView.tier`),
       * so the crew orbit can paint the crewmate's solid; null when it never
       * routed. Absent on a non-work row.
       */
      tier: slotSchema.nullable().optional(),
      /** Builder id only for a host-commissioned review; null on other work. */
      reviewOf: string().nullable().optional(),
      /** Actual task placement, not the project's current Runs on. */
      executionDeviceId: string().nullable().optional(),
      closedReason: _enum([
        "landed",
        "merged",
        "released",
        "answered",
        "settled",
        "finished",
        "cancelled",
        "discarded",
        "failed",
        "superseded"
      ]).nullable(),
      seq: number()
    }),
    /**
     * A timeline event landed on a task (task-system P3): the feed's source.
     * `text` is the feed-ready line the core authored from the event and its
     * record (src/core/tasks/taskFeed.ts), `feed` whether it belongs in the
     * global feed (a crewmate's own progress notes do not).
     */
    object({
      type: literal("task_event"),
      taskId: string(),
      key: string(),
      kind: string(),
      text: string(),
      at: number(),
      feed: boolean(),
      /**
       * Something sent reached the crewmate: words entered its turn, its turn
       * was stopped, its task closed under it or was edited (INF-759). The
       * center draws one spark out to it then. An announcement of its own,
       * never on a recorded event: `kind` is `reached`, `text` is empty and
       * `feed` false. Absent on every timeline event.
       */
      reached: literal(true).optional(),
      /** A feed line's fact, worded where it is shown; `text` is its English (docs/i18n.md, "Saved facts"). */
      said: saidSchema.optional()
    }),
    /**
     * The Firstmate agent's own busy state (drives the thinking phase), and
     * whether it is shortening its conversation now (the character's cinch);
     * absent means not.
     */
    object({
      type: literal("firstmate_state"),
      busy: boolean(),
      folding: boolean().optional()
    }),
    /** Live crew strip counts: runtimes plus queued work. */
    object({
      type: literal("crew_counts"),
      working: number(),
      idle: number(),
      queued: number()
    })
  ]);
  object({
    working: number(),
    idle: number(),
    queued: number()
  });
  const USAGE_PERIODS = ["7d", "30d", "all"];
  const usagePeriodSchema = _enum(USAGE_PERIODS);
  const USAGE_SCOPES = ["all", "task", "firstmate", "other"];
  const usageScopeSchema = _enum(USAGE_SCOPES);
  const usageQuerySchema = strictObject({
    period: usagePeriodSchema,
    scope: usageScopeSchema
  });
  _enum(["tokens", "usd"]);
  const categoriesSchema = (value) => object({ input: value, output: value, cacheRead: value, cacheWrite: value });
  const usageAmountSchema = object({
    tokens: categoriesSchema(number()),
    records: number(),
    /** Records that reported any token count. */
    counted: number(),
    /** Records reporting each token category; absent on older homes, never inferred from counted. */
    tokenReported: categoriesSchema(number()).optional(),
    cost: number().nullable(),
    /** Records with a price. */
    priced: number(),
    /** The estimate by category over the priced records that split it, null where none did. */
    costParts: categoriesSchema(number().nullable()),
    /** Priced records whose estimate is split by category. */
    split: number()
  });
  const usagePlaceSchema = object({
    kind: _enum(["task", "firstmate", "other"]),
    /** The task's key, title and project; null for the Firstmate and other work. */
    task: object({ key: string(), title: string(), project: string().nullable() }).nullable(),
    amount: usageAmountSchema
  });
  const USAGE_WORK_KINDS = [
    "plan",
    "research",
    "retrieval",
    "reproduce",
    "implement",
    "fix",
    "chore",
    "review",
    "operation"
  ];
  const usageWorkKindSchema = _enum(USAGE_WORK_KINDS);
  const usageProjectSchema = object({
    /** Null when the record no longer has the task's project. */
    project: object({ id: string(), name: string() }).nullable(),
    amount: usageAmountSchema,
    /** Each kind once; together they are the subtotal, never added to it. */
    kinds: array(object({ kind: usageWorkKindSchema.nullable(), amount: usageAmountSchema }))
  });
  const usageWhereSchema = object({
    firstmate: usageAmountSchema,
    projects: array(usageProjectSchema),
    other: usageAmountSchema
  });
  const usageAttributionSchema = _enum(["served", "requested", "recorded"]);
  const usagePriceSourceSchema = union([usageCostSourceSchema, literal("unrecorded")]);
  const usageModelSchema = object({
    /** Stable identity: the provider and model as recorded. */
    id: string(),
    provider: string().nullable(),
    providerName: string().nullable(),
    model: string().nullable(),
    /** The model by the name every surface gives it, or its id; null when none was recorded. */
    name: string().nullable(),
    attribution: usageAttributionSchema,
    priceSources: array(usagePriceSourceSchema),
    amount: usageAmountSchema,
    /** The work it served: the Firstmate, other work, and its largest tasks. */
    places: array(usagePlaceSchema),
    /** Its work, by project and kind, over this model's records alone. */
    where: usageWhereSchema
  });
  const usageDaySchema = object({
    /** The local calendar date, YYYY-MM-DD. */
    date: string(),
    amount: usageAmountSchema
  });
  object({
    query: usageQuerySchema,
    /** The first local day the period covers; null for all time with nothing recorded. */
    since: number().nullable(),
    /** When the summary was read: today is partial until it ends. */
    at: number(),
    total: usageAmountSchema,
    /** Every local day of the period, oldest first, today last. */
    days: array(usageDaySchema),
    models: array(usageModelSchema),
    /**
     * The Firstmate, other work, and the largest tasks by tokens and by
     * estimate, so either unit can name its own three largest.
     */
    places: array(usagePlaceSchema),
    where: usageWhereSchema,
    /** Tasks finished in the period and kind of work. */
    finished: number(),
    /** Tasks finished across all retained history, for the milestones. */
    finishedEver: number()
  });
  const usageReportingRefusalReasonSchema = _enum([
    "unreachable",
    "secure-connection",
    "refused"
  ]);
  object({
    host: string().nullable(),
    claudeOnly: literal(true).optional(),
    refusal: object({ host: string(), reason: usageReportingRefusalReasonSchema }).optional(),
    /** The host of the reporting connection the person added, which gets every model's work. */
    connection: string().optional(),
    /** Why that connection's last send did not get through, until one does or it is saved again. */
    connectionRefusal: usageReportingRefusalReasonSchema.optional()
  });
  const USAGE_TASKS_MAX = 5e3;
  const usageTasksQuerySchema = strictObject({
    period: usagePeriodSchema,
    scope: usageScopeSchema,
    limit: number().int().min(1).max(USAGE_TASKS_MAX)
  });
  const usageTaskSchema = object({
    task: object({ key: string(), title: string(), project: string().nullable() }),
    /** When the task was created: the list's order, newest first. */
    createdAt: number(),
    amount: usageAmountSchema,
    reported: categoriesSchema(number()),
    costReported: categoriesSchema(number())
  });
  object({
    query: usageTasksQuerySchema,
    /** The newest tasks with recorded usage in the period and work, at most `limit`. */
    tasks: array(usageTaskSchema),
    /** How many tasks have recorded usage in the period and work. */
    matching: number()
  });
  const usageTaskCostsQuerySchema = strictObject({ period: usagePeriodSchema });
  const usageTaskCostSchema = object({
    /** When it closed done: where it falls on the chart. */
    closedAt: number(),
    /** Null when the record no longer has the task's project. */
    project: object({ id: string(), name: string() }).nullable(),
    /** Its saved kind; null for none, `unclear` or one the list does not know. Never `review`. */
    kind: usageWorkKindSchema.nullable(),
    /** Tokens it and its reviews recorded; null when no record reported any. */
    tokens: number().nullable(),
    /** Its and its reviews' known estimate in USD; null when nothing was priced. */
    cost: number().nullable()
  });
  object({
    query: usageTaskCostsQuerySchema,
    /** The period's first moment; null for all time with nothing finished. */
    since: number().nullable(),
    /** When it was read: the chart's last point. */
    at: number(),
    /** Finished tasks from one window before `since`, oldest closed first. */
    tasks: array(usageTaskCostSchema)
  });
  function usageTokens(amount) {
    const { input, output, cacheRead, cacheWrite } = amount.tokens;
    return input + output + cacheRead + cacheWrite;
  }
  function usageValue(amount, unit) {
    if (unit === "usd") return amount.cost;
    return amount.counted > 0 ? usageTokens(amount) : null;
  }
  const USAGE_MILESTONES = [1, 10, 25, 50];
  function usageMilestone(finished) {
    const reached = [...USAGE_MILESTONES].reverse().find((stop) => finished >= stop) ?? null;
    const next = USAGE_MILESTONES.find((stop) => finished < stop) ?? null;
    return { reached, next };
  }
  const PROJECT_DELIVERY_WORDS = {
    "direct-pr": "pull requests",
    "queue-pr": "batched pull requests",
    "local-only": "local merge"
  };
  const AUTONOMY_WORDS = {
    putsInItself: "Merges on its own",
    asksFirst: "Asks first"
  };
  const AUTONOMY_SWITCH_NAME = "Ask before merging";
  const RIGOR_WORDS = {
    quick: "Quick",
    standard: "Default",
    reviewed: "Careful"
  };
  const PACE_TONES = {
    ahead: "warn",
    on_pace: "accent",
    behind: "ok",
    unknown: "idle"
  };
  function quotaMicroMeterLook(meter) {
    const { percentRemaining, pace = "unknown", clockPercent, stale = false } = meter;
    const known = typeof percentRemaining === "number";
    const low = known && percentRemaining <= 10;
    return {
      fill: known ? Math.max(0, Math.min(100, percentRemaining)) : 0,
      bar: stale ? "idle" : low ? "danger" : PACE_TONES[pace],
      figure: stale || !known ? "fg-3" : percentRemaining < 20 ? "danger" : percentRemaining < 50 ? "warn" : "fg-1",
      text: known ? `${Math.round(percentRemaining)}%` : "–",
      ...typeof clockPercent === "number" ? { clock: Math.max(0, Math.min(100, clockPercent)) } : {}
    };
  }
  const PACE_DEADBAND = 1;
  const EARLY_ELAPSED_PERCENT = 10;
  const SPEND_PRIORITY_CLAMP = 100;
  function windowSignals(window, nowMs) {
    const remaining = window.percentRemaining;
    if (window.resetsAtMs === void 0) {
      if (remaining !== void 0 && remaining >= 100) return { kind: "untriggered" };
      return { kind: "unmeasurable" };
    }
    if (remaining === void 0) return { kind: "unmeasurable" };
    const cycleSeconds = window.startsAtMs !== void 0 && window.resetsAtMs > window.startsAtMs ? (window.resetsAtMs - window.startsAtMs) / 1e3 : window.windowSeconds;
    if (!cycleSeconds || cycleSeconds <= 0) return { kind: "unmeasurable" };
    const remainingSeconds = (window.resetsAtMs - nowMs) / 1e3;
    if (remainingSeconds <= 0) return { kind: "unmeasurable" };
    const timeRemainingPercent = Math.min(100, 100 * remainingSeconds / cycleSeconds);
    const elapsedPercent = 100 - timeRemainingPercent;
    const used = 100 - remaining;
    let burnMultiple;
    if (elapsedPercent > 0) {
      burnMultiple = Math.max(0, used) / elapsedPercent;
    } else if (used <= 0) {
      burnMultiple = 0;
    } else {
      return { kind: "unmeasurable" };
    }
    const reservePercentPoints = remaining - timeRemainingPercent;
    const status = Math.abs(reservePercentPoints) <= PACE_DEADBAND ? "on_pace" : reservePercentPoints < 0 ? "ahead" : "behind";
    const elapsedSeconds = cycleSeconds * elapsedPercent / 100;
    const projectedExhaustedAtMs = burnMultiple > 0 && elapsedSeconds > 0 && used > 0 ? nowMs + remaining / (used / elapsedSeconds) * 1e3 : void 0;
    return {
      kind: "measured",
      status,
      reservePercentPoints,
      burnMultiple,
      timeRemainingPercent,
      elapsedPercent,
      cycleSeconds,
      ...projectedExhaustedAtMs !== void 0 ? { projectedExhaustedAtMs } : {},
      confidence: elapsedPercent < EARLY_ELAPSED_PERCENT ? "early" : "established"
    };
  }
  function scopeSignals(input) {
    const boundedBy = input.windows.map((window) => window.id);
    const perWindow = input.windows.map((window) => ({
      window,
      signals: windowSignals(window, input.nowMs)
    }));
    let effectivePercentRemaining;
    let limitingWindowId;
    let headroomUnknown = false;
    for (const { window } of perWindow) {
      if (typeof window.percentRemaining !== "number") {
        headroomUnknown = true;
        continue;
      }
      if (effectivePercentRemaining === void 0 || window.percentRemaining < effectivePercentRemaining) {
        effectivePercentRemaining = window.percentRemaining;
        limitingWindowId = window.id;
      }
    }
    if (headroomUnknown) {
      effectivePercentRemaining = void 0;
      limitingWindowId = void 0;
    }
    const statuses = /* @__PURE__ */ new Set();
    for (const { signals } of perWindow) {
      if (signals.kind === "measured") statuses.add(signals.status);
      else if (signals.kind === "unmeasurable") statuses.add("unknown");
    }
    const known = [...statuses].filter((status) => status !== "unknown");
    const pace = known.length > 1 ? "mixed" : known[0] ?? "unknown";
    const unmeasurableWindowIds = perWindow.filter((entry) => entry.signals.kind === "unmeasurable").map((entry) => entry.window.id);
    const exhausted = perWindow.find(
      (entry) => typeof entry.window.percentRemaining === "number" && entry.window.percentRemaining <= 0
    );
    let runway;
    if (exhausted) {
      runway = { status: "exhausted_now", limitingWindowId: exhausted.window.id };
    } else if (unmeasurableWindowIds.length > 0 || perWindow.length === 0) {
      runway = { status: "unknown" };
    } else {
      let earliest;
      let anyEarly = false;
      for (const { window, signals } of perWindow) {
        if (signals.kind !== "measured") continue;
        if (signals.confidence === "early") anyEarly = true;
        if (signals.projectedExhaustedAtMs !== void 0 && window.resetsAtMs !== void 0 && signals.projectedExhaustedAtMs < window.resetsAtMs && (!earliest || signals.projectedExhaustedAtMs < earliest.atMs)) {
          earliest = {
            atMs: signals.projectedExhaustedAtMs,
            windowId: window.id,
            confidence: signals.confidence
          };
        }
      }
      runway = earliest ? {
        status: "projected_exhaustion",
        projectedExhaustedAtMs: earliest.atMs,
        limitingWindowId: earliest.windowId,
        confidence: earliest.confidence
      } : { status: "through_reset", confidence: anyEarly ? "early" : "established" };
    }
    let spendPriority;
    if (unmeasurableWindowIds.length === 0) {
      let weighted = 0;
      let totalCycle = 0;
      for (const { signals } of perWindow) {
        if (signals.kind !== "measured") continue;
        const s = signals.reservePercentPoints + signals.timeRemainingPercent - signals.burnMultiple * signals.timeRemainingPercent;
        const gap = s / signals.timeRemainingPercent;
        weighted += gap * signals.cycleSeconds;
        totalCycle += signals.cycleSeconds;
      }
      if (totalCycle > 0) {
        spendPriority = Math.max(
          -SPEND_PRIORITY_CLAMP,
          Math.min(SPEND_PRIORITY_CLAMP, weighted / totalCycle)
        );
      }
    }
    return {
      scope: input.scope,
      boundedBy,
      ...effectivePercentRemaining !== void 0 ? { effectivePercentRemaining } : {},
      ...limitingWindowId !== void 0 ? { limitingWindowId } : {},
      pace,
      runway,
      ...spendPriority !== void 0 ? { spendPriority } : {},
      ...unmeasurableWindowIds.length > 0 ? { unmeasurableWindowIds } : {}
    };
  }
  function classifyProviderWindows(quotaId, windows) {
    const bounding = [];
    const scoped = /* @__PURE__ */ new Map();
    const excluded = [];
    const addScoped = (scope, window) => {
      const rows = scoped.get(scope) ?? [];
      rows.push(window);
      scoped.set(scope, rows);
    };
    for (const window of windows) {
      const id = window.id;
      if (id.includes("overage") || id.includes("extra_usage") || id === "overage") {
        excluded.push(window);
        continue;
      }
      const modelMatch = id.match(/^model:(.+?)(?::\d+[a-z]+)?$/);
      if (modelMatch?.[1]) {
        addScoped(`model:${modelMatch[1]}`, window);
        continue;
      }
      const claudeModel = id.match(/^seven_day_(.+)$/);
      if (claudeModel?.[1]) {
        addScoped(`model:${claudeModel[1]}`, window);
        continue;
      }
      if (id.startsWith("code_review")) {
        addScoped("code_review", window);
        continue;
      }
      if ((quotaId === "grok" || quotaId === "copilot") && id.startsWith("product:")) {
        addScoped(id, window);
        continue;
      }
      bounding.push(window);
    }
    return { combined: true, bounding, scoped, excluded };
  }
  function providerScopes(row, nowMs) {
    if (row.status !== "ok" || row.stale) return { combined: false, scopes: [] };
    const { combined, bounding, scoped } = classifyProviderWindows(row.provider, row.windows);
    const allModels = bounding.length > 0 ? scopeSignals({ scope: "all_models", windows: bounding, nowMs }) : void 0;
    const scopes = [...scoped.entries()].map(
      ([scope, extra]) => scopeSignals({
        scope,
        // A named scope is bounded by the account-wide windows plus its own.
        windows: [...bounding, ...extra],
        nowMs
      })
    );
    return { combined, ...allModels ? { allModels } : {}, scopes };
  }
  function formatDurationShort(ms) {
    const totalMinutes = Math.max(0, Math.round(ms / 6e4));
    const days = Math.floor(totalMinutes / (60 * 24));
    const hours = Math.floor(totalMinutes % (60 * 24) / 60);
    const minutes = totalMinutes % 60;
    if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
    if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
    return `${minutes}m`;
  }
  const SUBSCRIPTIONS_WORDS = {
    /** First-run copy when the machine has no Claude login yet (CD-1=B). */
    get claudeFirstRun() {
      return settingsSubscriptionsClaudeFirstRun({ here: HERE.this });
    },
    /** The Claude row while a sign-out mark holds the account, allowance or not. */
    get signedOutHoldLabel() {
      return settingsSubscriptionsSignedOutHoldLabel();
    },
    get signedOutHoldText() {
      return settingsSubscriptionsSignedOutHoldText();
    },
    /** The row while the provider is refusing this sign-in. */
    get refusedHoldLabel() {
      return settingsSubscriptionsRefusedHoldLabel();
    },
    get refusedHoldText() {
      return settingsSubscriptionsRefusedHoldText();
    },
    /** The tag on the one row whose account Firstmate runs on, and its tooltip. */
    get firstmateAccountTag() {
      return settingsSubscriptionsFirstmateAccountTag();
    },
    get firstmateAccountTagTitle() {
      return settingsSubscriptionsFirstmateAccountTagTitle();
    },
    /** What the ✱ beside an account's name means: crew work prefers it. */
    get crewPreferredMarkTitle() {
      return settingsSubscriptionsCrewPreferredMarkTitle();
    }
  };
  function noReaderText(kind) {
    return kind === "api_key" ? settingsSubscriptionsNoReaderKey({ apiKey: API_KEY_LABEL }) : settingsSubscriptionsNoReader();
  }
  const EMPTY_QUOTA_TEXT = {
    get signInAgain() {
      return settingsSubscriptionsEmptySignInAgain();
    },
    get slowDown() {
      return settingsSubscriptionsEmptySlowDown();
    },
    get unread() {
      return settingsSubscriptionsEmptyUnread();
    },
    get notYet() {
      return settingsSubscriptionsEmptyNotYet();
    }
  };
  const CREW_PREFERRED_MARK = "✱";
  const CREDITS_SITE = {
    claude: "claude.ai",
    codex: "chatgpt.com",
    copilot: "github.com"
  };
  function creditsLine(provider, credits, keepsGoing = false) {
    const site = CREDITS_SITE[provider];
    if (!credits || !site || credits.state === "unknown") return void 0;
    const fact = creditsFact(provider, credits);
    if (!fact) return void 0;
    const after = keepsGoing ? settingsSubscriptionsCreditsKeepsGoing() : settingsSubscriptionsCreditsWhere({ site });
    return `${fact} · ${after}`;
  }
  function savedResetsLine(provider, savedResets) {
    const site = CREDITS_SITE[provider];
    if (!SAVED_RESETS_PAGE[provider] || !site || !savedResets || savedResets.available < 1) {
      return void 0;
    }
    return settingsSubscriptionsSavedResets({ count: savedResets.available, site });
  }
  function creditsFact(provider, credits) {
    const { state } = credits;
    if (provider === "claude") {
      if (state === "off") return settingsSubscriptionsCreditsClaudeOff();
      if (state === "spent") return settingsSubscriptionsCreditsClaudeSpent();
      const percent = credits.usedPercent !== void 0 ? formatNumber(Math.round(credits.usedPercent)) : void 0;
      if (credits.inUse) {
        return percent !== void 0 ? settingsSubscriptionsCreditsClaudeInUseUsed({ percent }) : settingsSubscriptionsCreditsClaudeInUse();
      }
      return percent !== void 0 ? settingsSubscriptionsCreditsClaudeAvailableUsed({ percent }) : settingsSubscriptionsCreditsClaudeAvailable();
    }
    if (provider === "codex") {
      if (state === "off") return settingsSubscriptionsCreditsCodexOff();
      if (state === "spent") return settingsSubscriptionsCreditsCodexSpent();
      if (credits.unlimited) return settingsSubscriptionsCreditsCodexUnlimited();
      return credits.balance !== void 0 ? settingsSubscriptionsCreditsCodexBalance({ balance: balanceText(credits.balance) }) : settingsSubscriptionsCreditsCodexAvailable();
    }
    if (provider === "copilot") {
      if (state === "available") return settingsSubscriptionsCreditsCopilotAvailable();
      if (state === "off") return settingsSubscriptionsCreditsCopilotOff();
    }
    return void 0;
  }
  function balanceText(balance) {
    const value = Number(balance);
    return balance.trim() !== "" && Number.isFinite(value) ? formatNumber(value, { maximumFractionDigits: 2 }) : balance;
  }
  function kindCopy(kind) {
    return kind === "api_key" ? API_KEY_LABEL : settingsSubscriptionsKindSubscription();
  }
  function emptyQuotaText(status) {
    switch (status) {
      case "auth_required":
        return EMPTY_QUOTA_TEXT.signInAgain;
      case "rate_limited":
        return EMPTY_QUOTA_TEXT.slowDown;
      case "unavailable":
      case "error":
        return EMPTY_QUOTA_TEXT.unread;
      default:
        return EMPTY_QUOTA_TEXT.notYet;
    }
  }
  function measuredAgeText(measuredAt, now) {
    const minutes = Math.floor((now - measuredAt) / 6e4);
    if (minutes < 1) return settingsSubscriptionsAsOfJustNow();
    if (minutes < 60) return settingsSubscriptionsAsOfMinutes({ minutes: String(minutes) });
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return settingsSubscriptionsAsOfHours({ hours: String(hours) });
    return settingsSubscriptionsAsOfDays({ days: String(Math.floor(hours / 24)) });
  }
  function rowKind(account, row) {
    if (!account.enabled) return "paused";
    if (row?.status === "auth_required" || account.needsReauth || account.providerId === BEDROCK_PROVIDER_ID && account.cutOff?.class === "signed_out")
      return "auth";
    if (!account.connected) return "disconnected";
    if (!row) return isSensedProvider(account.providerId) ? "pending" : "no_row";
    if (row.stale) return "stale";
    if (row.status === "ok") return row.windows.length > 0 ? "ok" : "no_data";
    return row.status;
  }
  function runwayVerdict(runway, now, allModels) {
    if (runway.status === "through_reset") {
      return {
        text: allModels ? settingsSubscriptionsOnPaceAll() : settingsSubscriptionsOnPace(),
        tone: "ok"
      };
    }
    if (runway.status === "projected_exhaustion" && runway.projectedExhaustedAtMs !== void 0) {
      return {
        text: settingsSubscriptionsEmptyIn({
          duration: formatDurationShort(runway.projectedExhaustedAtMs - now)
        }),
        tone: "danger"
      };
    }
    if (runway.status === "exhausted_now")
      return { text: settingsSubscriptionsEmptyNow(), tone: "danger" };
    return void 0;
  }
  function verdictFor(kind, row, now) {
    if (kind === "paused")
      return { text: settingsSubscriptionsPaused(), tone: "neutral" };
    if (kind === "stale" && row) {
      return {
        text: row.measuredAt !== void 0 ? measuredAgeText(row.measuredAt, now) : settingsSubscriptionsStale(),
        tone: "warn"
      };
    }
    if (kind !== "ok" || !row) return void 0;
    const { allModels, scopes } = providerScopes(row, now);
    if (allModels) return runwayVerdict(allModels.runway, now, true);
    const lowest = scopes.reduce((a, b) => {
      if (!a || b.effectivePercentRemaining === void 0) return b;
      if (a.effectivePercentRemaining === void 0) return a;
      return b.effectivePercentRemaining < a.effectivePercentRemaining ? b : a;
    }, void 0);
    return lowest ? runwayVerdict(lowest.runway, now, false) : void 0;
  }
  function rowView(account, row, now) {
    const kind = rowKind(account, row);
    const identity = account.identity ?? row?.account;
    const plan = account.plan ?? row?.plan;
    const sub = account.access ? CLAUDE_ACCESS_LABEL[account.access] : [
      plan ?? kindCopy(account.kind),
      identity,
      account.gateway ? CLAUDE_GATEWAY_LABEL[account.gateway] : void 0
    ].filter(Boolean).join(" · ");
    const signedIn = account.kind === "api_key" ? settingsSubscriptionsApiKeySet({ apiKey: API_KEY_LABEL }) : settingsSubscriptionsSignedIn();
    const claudeFirstRun = kind === "disconnected" && account.providerId === CLAUDE_PROVIDER_ID;
    const dot = kind === "ok" ? { tone: "ok", label: signedIn } : kind === "stale" ? { tone: "warn", label: settingsSubscriptionsDotStale({ signedIn }) } : claudeFirstRun ? { tone: "ring", label: settingsSubscriptionsDotNotSignedInYet() } : kind === "auth" || kind === "disconnected" ? { tone: "danger", label: settingsSubscriptionsDotSignInAgain() } : kind === "paused" ? { tone: "idle", label: settingsSubscriptionsPaused() } : kind === "pending" ? { tone: "ring", label: settingsSubscriptionsDotReading({ signedIn }) } : { tone: "ring", label: settingsSubscriptionsDotNoReading({ signedIn }) };
    const view = {
      kind,
      dot: dot.tone,
      dotLabel: dot.label,
      sub,
      meters: [],
      signIn: false,
      retry: false
    };
    if (kind === "auth") {
      view.stateText = account.providerId === BEDROCK_PROVIDER_ID ? [settingsSubscriptionsSignInAgainState(), row?.detail].filter(Boolean).join(" ") : emptyQuotaText("auth_required");
      view.stateTone = "danger";
      view.signIn = true;
      return view;
    }
    if (kind === "disconnected") {
      if (account.providerId === CLAUDE_PROVIDER_ID) {
        view.stateText = SUBSCRIPTIONS_WORDS.claudeFirstRun;
        view.signIn = true;
        return view;
      }
      view.stateText = settingsSubscriptionsSignInAgainState();
      view.stateTone = "danger";
      view.signIn = true;
      return view;
    }
    if (account.detail) {
      view.dot = "warn";
      view.dotLabel = settingsSubscriptionsNotReady();
      view.stateText = account.detail;
      return view;
    }
    if (kind === "pending") {
      view.stateText = settingsSubscriptionsReading();
      return withHold(view, account, now);
    }
    if (kind === "no_row") {
      view.stateText = noReaderText(account.kind);
      return view;
    }
    view.retry = isKeychainValueFailure(row?.reason);
    if (account.providerId === BEDROCK_PROVIDER_ID && kind === "unavailable" && row?.reason === BEDROCK_PROFILE_UNAVAILABLE) {
      view.signIn = true;
    }
    if (row && kind !== "ok" && kind !== "paused") {
      if (kind === "stale") {
        if (row.detail) view.stateText = row.detail;
      } else {
        view.stateText = row.detail ?? emptyQuotaText(row.status);
        return account.access ? withHold(view, account, now) : view;
      }
    }
    view.meters = (row?.windows ?? []).map((window) => {
      const signals = windowSignals(window, now);
      return {
        id: window.id,
        label: window.label,
        ...window.percentRemaining !== void 0 ? { percent: window.percentRemaining } : {},
        pace: window.pace ?? "unknown",
        ...window.resetText ? { resetText: window.resetText } : {},
        ...signals.kind === "measured" ? { clock: signals.timeRemainingPercent } : {}
      };
    });
    const verdict = verdictFor(kind, row, now);
    if (verdict) view.verdict = verdict;
    const credits = row ? creditsLine(row.provider, row.credits, account.keepGoingOnCredits === true) : void 0;
    if (credits) view.credits = credits;
    const savedResets = row ? savedResetsLine(row.provider, row.savedResets) : void 0;
    if (savedResets) view.savedResets = savedResets;
    return withHold(view, account, now);
  }
  function withHold(view, account, now) {
    const hold = standingCutOff(account, now);
    if (!account.enabled || !account.connected) return view;
    if (hold?.class !== "signed_out" && hold?.class !== "refused") return view;
    view.dot = "warn";
    view.dotLabel = hold.class === "signed_out" ? SUBSCRIPTIONS_WORDS.signedOutHoldLabel : SUBSCRIPTIONS_WORDS.refusedHoldLabel;
    view.stateText = hold.class === "signed_out" ? SUBSCRIPTIONS_WORDS.signedOutHoldText : SUBSCRIPTIONS_WORDS.refusedHoldText;
    view.stateTone = "danger";
    if (hold.class === "signed_out") {
      view.signIn = true;
      if (account.access) {
        view.stateText = CLAUDE_ACCESS_REFUSED_TEXT[account.access];
        view.signInLabel = CLAUDE_ACCESS_TRY_AGAIN_LABEL;
      }
    }
    return view;
  }
  function accountsSummary(rows) {
    const waiting = rows.filter((row) => row.signIn).length;
    const accounts = settingsAccountsCount({ count: rows.length });
    return waiting === 0 ? accounts : settingsAccountsWaiting({ accounts, count: waiting });
  }
  function clockOf(at) {
    const t = new Date(at);
    return `${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`;
  }
  const DEVICE_SIGN_INS_WORDS = {
    own: (where) => settingsDevicesSignInsOwn({ where }),
    /** It was asked and did not answer; `home` is the first mate's computer as the reader names it. */
    unanswered: (who, home) => settingsDevicesSignInsUnanswered({ who, home }),
    get none() {
      return settingsDevicesSignInsNone();
    }
  };
  function awayNote(device) {
    if (device.reach === "in-reach" && !device.updating) return null;
    const away = awayWord(device.reach === "connecting", device.updating);
    if (!device.asOf) return away;
    const time2 = formatTime(device.asOf, { hour: "2-digit", minute: "2-digit" });
    return `${away} · ${settingsDevicesSignInsAsOf({ time: time2 })}`;
  }
  function hereZone() {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  }
  function runWords(run) {
    const sent = automationDateWords(run.firedAt);
    const skipped = run.screened ?? 0;
    if (run.events !== void 0 && run.events === 0 && skipped > 0)
      return automationRunSkipped({ count: skipped, date: sent });
    if (run.events !== void 0) {
      const events = settingsAutomationRunEvents({ count: run.events, sent });
      return skipped > 0 ? `${events}, ${automationRunAlsoSkipped({ count: String(skipped) })}` : events;
    }
    const planned = automationDateWords(run.plannedAt);
    if (run.missed > 0)
      return settingsAutomationRunCatchingUpMissed({ count: run.missed, planned, sent });
    if (run.catchUp) return settingsAutomationRunCatchingUp({ planned, sent });
    return settingsAutomationRunPlanned({ planned, sent });
  }
  const DELIVERY_WORDS = {
    get waiting() {
      return settingsAutomationDeliveryWaiting();
    },
    get retrying() {
      return settingsAutomationDeliveryRetrying();
    },
    get handled() {
      return settingsAutomationDeliveryHandled();
    },
    get cancelled() {
      return settingsAutomationDeliveryCancelled();
    },
    get sent() {
      return settingsAutomationDeliverySent();
    }
  };
  const DELIVERY_TONES = {
    waiting: "busy",
    retrying: "warn",
    handled: "ok",
    cancelled: "idle",
    sent: "ring"
  };
  function sentNothing(run) {
    return run.events === 0 && Boolean(run.screened);
  }
  function runStateWords(run) {
    return sentNothing(run) ? automationRunSkippedState() : DELIVERY_WORDS[run.delivery];
  }
  function runPromptTitle(run) {
    return sentNothing(run) ? automationEventsSkipped() : settingsAutomationPromptAsSent();
  }
  function deliveryNote(run) {
    switch (run.delivery) {
      case "waiting":
        return settingsAutomationNoteWaiting();
      case "retrying":
        return settingsAutomationNoteRetrying();
      case "handled":
        return run.settledAt === null ? null : handledNote(run);
      case "cancelled":
        if (run.cancelReason) return CANCEL_WORDS[run.cancelReason];
        return run.screened ? automationScreenedNote() : settingsAutomationNoteCancelled();
      case "sent":
        return null;
    }
  }
  function handledNote(run) {
    const at = new Date(run.settledAt ?? run.firedAt);
    return at.toDateString() === new Date(run.firedAt).toDateString() ? settingsAutomationNoteHandledAt({
      time: automationClockWords(at.getHours(), at.getMinutes())
    }) : settingsAutomationNoteHandledOn({ date: automationDateWords(at.getTime()) });
  }
  const CANCEL_WORDS = {
    get edited() {
      return settingsAutomationCancelEdited();
    },
    get paused() {
      return settingsAutomationCancelPaused();
    },
    get cleared() {
      return settingsAutomationCancelCleared();
    }
  };
  function eventRunsWords(every) {
    return every === void 0 ? settingsAutomationRunsEachTime() : settingsAutomationRunsEachTimeLooks({ count: every });
  }
  function reviewMissedWords(spec, where) {
    if (spec.kind === "event")
      return where ? settingsAutomationMissedEventThere({ where }) : settingsAutomationMissedEvent();
    if (spec.kind === "once")
      return where ? settingsAutomationMissedOnceThere({ where }) : settingsAutomationMissedOnce();
    return where ? settingsAutomationMissedRepeatsThere({ where }) : settingsAutomationMissedRepeats();
  }
  function zoneNote(where) {
    return where ? settingsAutomationZoneNoteThere({ where }) : settingsAutomationZoneNote();
  }
  function localTimeNote(where) {
    return where ? settingsAutomationLocalTimeNoteThere({ where }) : settingsAutomationLocalTimeNote();
  }
  function localClockWords(where) {
    return where ? settingsAutomationClockThere({ where }) : settingsAutomationClockHere();
  }
  const AUTOMATION_SHEET_WORDS = {
    /** The review before a rule is turned on: what it sends, and where. */
    get reviewSends() {
      return settingsAutomationReviewSends();
    },
    /** The review's word on what an event rule sends, in place of `reviewSends`. */
    get reviewSendsEvents() {
      return settingsAutomationReviewSendsEvents();
    },
    /** What the preview fills `{{events}}` with, before any event arrived. */
    get eventsPreview() {
      return settingsAutomationEventsPreview();
    },
    /** What a draft says at the top of its sheet. */
    get draftNote() {
      return settingsAutomationDraftNote();
    },
    /** A stopped event rule's When, at the top of its sheet. */
    get stoppedWhen() {
      return settingsAutomationStoppedWhen();
    }
  };
  function previewPrompt(spec, prompt, dates, now) {
    const first = spec.kind === "event" ? now : dates[0];
    if (first === void 0) return prompt.trim();
    return fillScheduleDetails(prompt.trim(), {
      plannedAt: first,
      timeZone: automationZoneOf(spec) ?? hereZone(),
      missed: 0,
      ...spec.kind === "event" ? { events: AUTOMATION_SHEET_WORDS.eventsPreview } : {}
    });
  }
  function ruleProjectWords(projectId, projects) {
    if (!projectId) return settingsAutomationNoProject();
    return projects.find((one) => one.id === projectId)?.name ?? settingsAutomationRemovedProject();
  }
  function reviewFacts(review, projects, where, { zoneNote: withZoneNote = false } = {}) {
    const { spec, listened } = review;
    const zone = automationZoneOf(spec);
    const next = review.dates.map((at) => automationDateWords(at, zone));
    const zoneFact = () => {
      const words = zone ? automationZoneWords(zone) : localClockWords(where);
      if (!withZoneNote) return { term: settingsAutomationTimeZone(), value: words };
      const note = zone ? zoneNote(where) : localTimeNote(where);
      return {
        term: settingsAutomationTimeZone(),
        value: `${words}. ${note}`,
        lines: [words, note]
      };
    };
    return [
      { term: settingsAutomationWhen(), value: automationWhenWords(spec, listened?.when) },
      ...spec.kind === "daily" || spec.kind === "weekly" ? [zoneFact()] : [],
      ...spec.kind === "event" ? (listened?.filters ?? []).map((field) => ({
        term: field.label,
        value: spec.filter?.[field.name] || field.defaultValue || settingsAutomationNotSpecified()
      })) : [],
      ...spec.kind === "event" && spec.waitsFor ? [{ term: automationWaitsFor(), value: `${spec.waitsFor}. ${automationWaitsForNote()}` }] : [],
      { term: settingsAutomationProject(), value: ruleProjectWords(review.projectId, projects) },
      spec.kind === "event" ? { term: settingsAutomationRuns(), value: eventRunsWords(listened?.every) } : {
        term: spec.kind === "once" ? settingsAutomationRuns() : settingsAutomationNextRuns(),
        value: next.length === 0 ? settingsAutomationPassed() : next.join(" · "),
        ...next.length > 1 ? { lines: next } : {}
      },
      { term: settingsAutomationFirstMateGets(), value: review.prompt, prompt: true },
      {
        term: settingsAutomationWhatItSends(),
        value: spec.kind === "event" ? AUTOMATION_SHEET_WORDS.reviewSendsEvents : AUTOMATION_SHEET_WORDS.reviewSends
      },
      { term: settingsAutomationMissedTime(), value: reviewMissedWords(spec, where) }
    ];
  }
  function reviewCanTurnOn(spec, dates) {
    return spec.kind === "event" || dates.length > 0;
  }
  const PROJECT_COST_WORDS = {
    get title() {
      return settingsProjectsCostTitle();
    },
    get description() {
      return settingsProjectsCostDescription();
    },
    get choices() {
      return [
        { value: "follow", label: settingsProjectsCostFollow() },
        { value: "amount", label: settingsProjectsCostOwn() },
        { value: "none", label: settingsProjectsCostNone() }
      ];
    },
    get amount() {
      return settingsProjectsCostAmount();
    }
  };
  function namesOf(project) {
    if (project.repos) return project.repos.map((repo) => repo.name);
    return project.repo ? [project.repo.name] : [];
  }
  function projectEntries(repos, projects) {
    const owner = /* @__PURE__ */ new Map();
    for (const project of projects) {
      if (project.archived) continue;
      for (const name of namesOf(project)) owner.set(name, project);
    }
    const entries = [];
    const groups = /* @__PURE__ */ new Map();
    for (const repo of repos) {
      const project = owner.get(repo.name);
      const held = project ? namesOf(project).filter((name) => repos.some((r) => r.name === name)) : [];
      if (!project || held.length < 2) {
        entries.push({
          kind: "one",
          repo,
          project: project ? { id: project.id, key: project.key, name: project.name } : null
        });
        continue;
      }
      const group = groups.get(project.id);
      if (group) {
        group.repos.push(repo);
        continue;
      }
      const entry = {
        kind: "several",
        project: { id: project.id, key: project.key, name: project.name },
        repos: [repo]
      };
      groups.set(project.id, entry);
      entries.push(entry);
    }
    return entries;
  }
  const PROJECT_POLICY_WORDS = {
    /**
     * What "Where changes go" says on every project but the personal
     * workspace: it names batched pull requests only while they are offered.
     */
    delivery: (batches) => batches ? settingsProjectsDelivery() : settingsProjectsDeliveryNoBatch(),
    /** The first row's name: the personal workspace is a kind of workspace, not a way to deliver. */
    deliveryTitle: (personal) => personal ? settingsProjectsWorkspace() : settingsProjectsDeliveryTitle(),
    get workspace() {
      return settingsProjectsWorkspaceDescription();
    },
    /** What the asks-first row says under its name. */
    asks: (personal, autonomy) => personal ? settingsProjectsAutonomyPersonal() : autonomy ? settingsProjectsAutonomyOn() : settingsProjectsAutonomyOff(),
    get rigorTitle() {
      return settingsProjectsCare();
    },
    /** What the Rigor row says under its name. */
    rigor: (personal) => personal ? settingsProjectsCarePersonal() : settingsProjectsRigorDescription(),
    /** The personal workspace's rigor, in place of a choice. */
    get rigorNone() {
      return settingsProjectsCareNone();
    },
    /** The Require pull request checks row's name and its switch's (docs/forge.md, "A project with no checks"). */
    get checksTitle() {
      return settingsProjectsRequireChecks();
    },
    /**
     * What the Require pull request checks row says under its name: on, that
     * checks hold the merge; off, that the project runs none, since when, and
     * the task whose crewmate found it.
     */
    checks: (noChecks) => {
      if (!noChecks) return PROJECT_POLICY_WORDS.checksOn;
      const date2 = formatDate(noChecks.at, { month: "short", day: "numeric" });
      const since = noChecks.task ? settingsProjectsRequireChecksFound({ date: date2, task: noChecks.task }) : settingsProjectsRequireChecksSince({ date: date2 });
      return `${PROJECT_POLICY_WORDS.checksOff} ${since}`;
    },
    /** Under Require pull request checks while it is on. */
    get checksOn() {
      return settingsProjectsRequireChecksOn();
    },
    /** Under Require pull request checks while it is off, before when and by whom. */
    get checksOff() {
      return settingsProjectsRequireChecksOff();
    },
    /** The Disclose AI assistance row's name and its switch's (docs/forge.md, "Disclosing AI assistance"). */
    get disclosureTitle() {
      return settingsProjectsDisclosure();
    },
    /** What the Disclose AI assistance row says under its name, on or off. */
    disclosure: (on) => on ? settingsProjectsDisclosureOn() : settingsProjectsDisclosureOff(),
    /** The name of the field holding the project's line. */
    get disclosureLine() {
      return settingsProjectsDisclosureLine();
    },
    get advisoryTitle() {
      return settingsProjectsAdvisoryTitle();
    },
    get advisory() {
      return settingsProjectsAdvisoryDescription();
    },
    get advisoryLabel() {
      return settingsProjectsAdvisoryLabel();
    },
    get advisoryInvalid() {
      return settingsProjectsAdvisoryInvalid();
    },
    get advisoryClearsAddress() {
      return settingsProjectsAdvisoryClearsAddress();
    },
    get advisoryClearsTarget() {
      return settingsProjectsAdvisoryClearsTarget();
    },
    /** Beside the control a refused save came from (`projectRefusalOf`). */
    refused: (refusal) => refusal === "advisory-moved" ? settingsProjectsAdvisoryMovedRefusal() : refusal === "advisory-changing" ? settingsProjectsAdvisoryTargetRefusal() : settingsProjectsTargetResetRefusal(),
    /** Under the rows of a project that merges locally and asks for Careful. */
    get carefulLocal() {
      return settingsProjectsLocalCareful();
    }
  };
  function batchNoHostWords() {
    return settingsProjectsBatchNoHost();
  }
  const PROJECT_ROW_WORDS = {
    get personal() {
      return settingsProjectsRowPersonal();
    },
    get linked() {
      return settingsProjectsRowLinked();
    },
    localMerge: PROJECT_DELIVERY_WORDS["local-only"],
    mergesOnItsOwn: AUTONOMY_WORDS.putsInItself.toLowerCase(),
    get quick() {
      return settingsProjectsRowCare({ care: RIGOR_WORDS.quick });
    },
    get careful() {
      return settingsProjectsRowCare({ care: RIGOR_WORDS.reviewed });
    },
    runs: (where) => settingsProjectsRowRuns({ where }),
    get noChecks() {
      return settingsProjectsRowNoChecks();
    }
  };
  function inProjectsFolder(path, folder) {
    const root = folder.replace(/\/+$/, "");
    return path === root || path.startsWith(`${root}/`);
  }
  function projectRowWords(repo, folder, runsWhere) {
    if (repo.kind === "personal") return [PROJECT_ROW_WORDS.personal];
    const words = [];
    if (folder !== null && !inProjectsFolder(repo.path, folder)) words.push(PROJECT_ROW_WORDS.linked);
    if (repo.delivery === "local-only") words.push(PROJECT_ROW_WORDS.localMerge);
    if (repo.autonomy) words.push(PROJECT_ROW_WORDS.mergesOnItsOwn);
    if (repo.rigor === "quick") words.push(PROJECT_ROW_WORDS.quick);
    if (repo.rigor === "reviewed") words.push(PROJECT_ROW_WORDS.careful);
    if (repo.noChecks && readsPullRequestChecks(repo)) words.push(PROJECT_ROW_WORDS.noChecks);
    if (runsWhere && repo.runsOn && repo.runsOn !== AUTOMATIC_COMPUTER)
      words.push(PROJECT_ROW_WORDS.runs(runsWhere));
    return words;
  }
  function projectsSummary(repos) {
    const count = repos.filter((repo) => repo.kind !== "personal").length;
    return count === 0 ? settingsProjectsNone() : settingsProjectsCount({ count });
  }
  function runsOnWhere(repo, computers) {
    if (!repo.runsOn) return null;
    if (repo.runsOn === AUTOMATIC_COMPUTER) return settingsRunsOnAutomatically();
    return wordedPlace(
      devicePlace(
        computers.map((computer) => ({ ...computer, id: computer.deviceId })),
        repo.runsOn
      )
    ).where;
  }
  const USAGE_WORDS = {
    get notAvailable() {
      return settingsUsageNotAvailable();
    }
  };
  const PERIOD_WORDS = {
    get "7d"() {
      return settingsUsagePeriod7d();
    },
    get "30d"() {
      return settingsUsagePeriod30d();
    },
    get all() {
      return settingsUsagePeriodAll();
    }
  };
  const SCOPE_WORDS = {
    get firstmate() {
      return settingsUsageScopeFirstmate();
    },
    get other() {
      return settingsUsageScopeOther();
    }
  };
  const UNIT_WORDS = {
    get tokens() {
      return settingsUsageUnitTokens();
    },
    get usd() {
      return settingsUsageUnitUsd();
    }
  };
  function compactTokens(tokens) {
    if (tokens >= 1e9) return `${(tokens / 1e9).toFixed(2)}B`;
    if (tokens >= 1e6) return `${(tokens / 1e6).toFixed(2)}M`;
    if (tokens >= 1e3) return `${(tokens / 1e3).toFixed(1)}k`;
    return formatNumber(Math.round(tokens));
  }
  function dollars(usd) {
    if (usd >= 1e3) return `$${formatNumber(Math.round(usd))}`;
    if (usd > 0 && usd < 0.01) return "<$0.01";
    return `$${usd.toFixed(2)}`;
  }
  function formatUsage(value, unit) {
    if (value === null) return USAGE_WORDS.notAvailable;
    return unit === "tokens" ? compactTokens(value) : dollars(value);
  }
  function formatAmount(amount, unit) {
    return formatUsage(usageValue(amount, unit), unit);
  }
  function formatRecorded(amount, unit) {
    return amount.records === 0 ? settingsUsageNoActivity() : formatAmount(amount, unit);
  }
  function shortDate(date2) {
    const [year, month, day] = date2.split("-").map(Number);
    return formatLanguageDate(new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1), {
      month: "short",
      day: "numeric"
    });
  }
  function periodLabel(summary) {
    const first = summary.days[0]?.date;
    const last = summary.days.at(-1)?.date;
    if (!first || !last) return settingsUsageNothingRecorded();
    if (summary.query.period === "all") return settingsUsagePeriodSince({ date: shortDate(first) });
    return settingsUsagePeriodRange({ first: shortDate(first), last: shortDate(last) });
  }
  function pricedLine(amount) {
    return settingsUsagePriced({ priced: String(amount.priced), records: String(amount.records) });
  }
  function completeTokens(amount) {
    return amount.tokenReported !== void 0 && Object.values(amount.tokenReported).every((count) => count === amount.records);
  }
  function hasRecordedModels(summary) {
    return summary.models.some((model) => model.attribution === "recorded");
  }
  function readouts(summary, unit) {
    const { total } = summary;
    const usage = unit === "tokens" ? {
      label: settingsUsageReadoutTokens(),
      value: formatAmount(total, unit),
      note: completeTokens(total) ? settingsUsageReadoutTokensComplete() : settingsUsageReadoutTokensPartial()
    } : {
      label: total.priced > 0 && total.priced < total.records ? settingsUsageReadoutKnownEstimate() : settingsUsageReadoutEstimate(),
      value: formatAmount(total, unit),
      note: pricedLine(total)
    };
    return [
      usage,
      {
        label: settingsUsageReadoutFinished(),
        value: String(summary.finished),
        note: settingsUsageReadoutFinishedNote()
      },
      {
        label: hasRecordedModels(summary) ? settingsUsageReadoutRecordedModels() : settingsUsageReadoutModelsUsed(),
        value: String(summary.models.length),
        note: settingsUsageReadoutModelsNote()
      }
    ];
  }
  function byValue(a, b, unit) {
    const left = usageValue(a, unit);
    const right = usageValue(b, unit);
    if (left === null || right === null) return left === null ? right === null ? 0 : 1 : -1;
    return right - left;
  }
  function sortedModels(models, unit) {
    return [...models].sort((a, b) => byValue(a.amount, b.amount, unit));
  }
  function modelName(model) {
    return model.name ?? settingsUsageModelNotRecorded();
  }
  function modelLine(model) {
    const provider = model.providerName ?? settingsUsageProviderNotRecorded();
    return model.attribution === "recorded" ? settingsUsageModelLineRecorded({ provider }) : provider;
  }
  const KIND_WORDS = {
    get plan() {
      return settingsUsageKindPlan();
    },
    get research() {
      return settingsUsageKindResearch();
    },
    get retrieval() {
      return settingsUsageKindRetrieval();
    },
    get reproduce() {
      return settingsUsageKindReproduce();
    },
    get implement() {
      return settingsUsageKindImplement();
    },
    get fix() {
      return settingsUsageKindFix();
    },
    get chore() {
      return settingsUsageKindChore();
    },
    get review() {
      return settingsUsageKindReview();
    },
    get operation() {
      return settingsUsageKindOperation();
    }
  };
  function kindWords(kind) {
    return kind === null ? settingsUsageKindOther() : KIND_WORDS[kind];
  }
  function whereRows(where, unit, withFirstmate) {
    const ranked = (rows) => rows.sort((a, b) => byValue(a.amount, b.amount, unit) || a.name.localeCompare(b.name));
    return {
      firstmate: withFirstmate || where.firstmate.records > 0 ? where.firstmate : null,
      projects: ranked(
        where.projects.map((project) => ({
          key: project.project?.id ?? "unavailable",
          name: project.project?.name ?? settingsUsageProjectUnavailable(),
          amount: project.amount,
          kinds: ranked(
            project.kinds.map((each) => ({
              key: each.kind ?? "other",
              name: kindWords(each.kind),
              amount: each.amount
            }))
          )
        }))
      ),
      other: where.other.records > 0 ? where.other : null
    };
  }
  function milestoneWords(finishedEver) {
    const { reached, next } = usageMilestone(finishedEver);
    const finished = finishedEver === 0 ? settingsUsageMilestoneNone() : finishedEver === 1 ? settingsUsageMilestoneFinishedOne() : settingsUsageMilestoneFinished({ count: String(finishedEver) });
    const where = next === null ? settingsUsageMilestoneReached({ count: String(reached) }) : reached === null ? settingsUsageMilestoneFirst() : settingsUsageMilestoneNext({ count: String(next) });
    return {
      title: settingsUsageMilestoneTitle({ finished, where }),
      note: settingsUsageMilestoneNote()
    };
  }
  function usageSummaryLine(summary) {
    if (summary.total.records === 0) return settingsUsageEmptyTitle();
    const tokens = usageValue(summary.total, "tokens");
    const period = PERIOD_WORDS[summary.query.period];
    return tokens === null ? period : settingsUsageSummary({ tokens: compactTokens(tokens), period });
  }
  const PHONE_SETTINGS_WORDS = {
    /** Where a waiting account signs in: "Sign in on Mac mini.", with the row's own action where it has one. */
    signIn: (where, action = settingsPhoneSignInAction()) => settingsPhoneSignIn({ action, where }),
    accountsThere: (home) => settingsPhoneAccountsThere({ home }),
    get noAccounts() {
      return settingsPhoneNoAccounts();
    },
    /** When the allowance was last read, opposite the accounts' count. */
    asOf: (time2) => settingsSubscriptionsAsOfTime({ time: time2 }),
    noAutomations: (home) => settingsPhoneNoAutomations({ home }),
    automationsThere: (home) => settingsPhoneAutomationsThere({ home }),
    pauseAllAsk: (count) => settingsPhonePauseAllAsk({ count }),
    /** Why a rule stopped, then where its integration is picked again. */
    stoppedThere: (reason, home) => settingsPhoneStoppedThere({ reason, home }),
    get byFirstMate() {
      return settingsPhoneByFirstMate();
    },
    get nextRun() {
      return settingsPhoneNextRun();
    },
    get lastRan() {
      return settingsPhoneLastRan();
    },
    usageThere: (home) => settingsPhoneUsageThere({ home }),
    projectsThere: (home) => settingsPhoneProjectsThere({ home }),
    noProjects: (home) => settingsPhoneNoProjects({ home }),
    get save() {
      return settingsPhoneSave();
    },
    get runbooksLead() {
      return settingsPhoneRunbooksLead();
    }
  };
  function accountRow(account, quota, providerName, place, firstmate, now) {
    const row = quota?.providers.find((entry) => entry.accountId === account.id);
    const view = rowView(account, row, now);
    const stale = view.kind === "stale";
    const saysWhere = view.stateText === SUBSCRIPTIONS_WORDS.claudeFirstRun;
    return {
      id: account.id,
      provider: providerName(account.providerId),
      name: account.label,
      sub: view.sub,
      dot: view.dot,
      dotLabel: view.dotLabel,
      marks: [
        ...account.pinned ? [CREW_PREFERRED_MARK] : [],
        ...firstmate ? [SUBSCRIPTIONS_WORDS.firstmateAccountTag] : []
      ],
      meters: view.meters.map((meter) => {
        const look = quotaMicroMeterLook({
          percentRemaining: meter.percent,
          pace: meter.pace,
          clockPercent: meter.clock,
          stale
        });
        return {
          id: meter.id,
          label: meter.label,
          text: look.text,
          fill: look.fill,
          bar: look.bar,
          figure: look.figure,
          ...look.clock !== void 0 ? { clock: look.clock } : {},
          stale,
          ...meter.resetText ? { reset: meter.resetText } : {}
        };
      }),
      ...view.verdict ? { verdict: view.verdict } : {},
      ...view.stateText ? {
        state: {
          text: hereAs(view.stateText, place.who),
          danger: view.stateTone === "danger"
        }
      } : {},
      ...view.signIn && !saysWhere ? { signIn: PHONE_SETTINGS_WORDS.signIn(place.where, view.signInLabel) } : {}
    };
  }
  function intelligencePage(input) {
    const { accounts, snapshot, providers, devices, home, now } = input;
    const order = new Map(providers.map((provider, index) => [provider.id, index]));
    const nameIn = (list) => (id) => list.find((provider) => provider.id === id)?.name ?? providers.find((provider) => provider.id === id)?.name ?? catalogEntry(id)?.name ?? (isCustomApiProvider(id) ? settingsGeneralCustomApi() : id);
    const ordered = [...accounts].sort(
      (a, b) => (order.get(a.providerId) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.providerId) ?? Number.MAX_SAFE_INTEGER) || a.createdAt - b.createdAt
    );
    const homeRows = ordered.map(
      (account) => accountRow(
        account,
        snapshot,
        nameIn(providers),
        { who: home, where: placeOn({ computer: home }) },
        input.firstmateAccount === account.id,
        now
      )
    );
    const groups = [
      {
        id: "home",
        ...devices.length > 0 ? { label: home } : {},
        ...homeRows.length === 0 ? { empty: PHONE_SETTINGS_WORDS.noAccounts } : {},
        rows: homeRows
      },
      ...devices.map((device) => {
        const place = wordedPlace(signInPlace(device));
        const note = awayNote(device);
        const rows = (device.signIns?.accounts ?? []).map(
          (account) => accountRow(
            account,
            device.signIns?.quota,
            nameIn(device.signIns?.providers ?? []),
            place,
            false,
            now
          )
        );
        return {
          id: device.deviceId,
          label: place.label,
          line: DEVICE_SIGN_INS_WORDS.own(place.where),
          ...note ? { note } : {},
          ...rows.length === 0 ? {
            empty: device.unanswered ? DEVICE_SIGN_INS_WORDS.unanswered(place.who, home) : DEVICE_SIGN_INS_WORDS.none
          } : {},
          rows
        };
      })
    ];
    const every = groups.flatMap((group) => group.rows);
    return {
      summary: accountsSummary(every.map((row) => ({ signIn: row.signIn !== void 0 }))),
      ...snapshot && snapshot.providers.length > 0 ? { asOf: PHONE_SETTINGS_WORDS.asOf(clockOf(snapshot.fetchedAt)) } : {},
      groups,
      marks: [
        ...every.some((row) => row.marks.includes(CREW_PREFERRED_MARK)) ? [{ mark: CREW_PREFERRED_MARK, words: SUBSCRIPTIONS_WORDS.crewPreferredMarkTitle }] : [],
        ...every.some((row) => row.marks.includes(SUBSCRIPTIONS_WORDS.firstmateAccountTag)) ? [
          {
            mark: SUBSCRIPTIONS_WORDS.firstmateAccountTag,
            words: SUBSCRIPTIONS_WORDS.firstmateAccountTagTitle
          }
        ] : []
      ],
      foot: PHONE_SETTINGS_WORDS.accountsThere(home)
    };
  }
  function ruleWhen(rule) {
    return rule.stopped ? AUTOMATION_SHEET_WORDS.stoppedWhen : automationWhenWords(rule.spec, rule.when);
  }
  function runsNext(rule) {
    return rule.state === "enabled" && rule.nextFire !== null;
  }
  function ruleAction(rule) {
    if (rule.state === "enabled") return { id: "pause", label: settingsAutomationPause() };
    if (rule.state === "paused") return { id: "resume", label: settingsAutomationResume() };
    if (rule.state === "draft" && !rule.stopped)
      return { id: "review", label: settingsAutomationEnable() };
    return void 0;
  }
  function automationPage(input) {
    const { list, home } = input;
    const unreadable = list.state === "unavailable";
    const running = list.rules.filter((rule) => rule.state === "enabled").length;
    return {
      summary: automationSummary(list.rules, unreadable).join(" · "),
      lead: settingsPhoneAutomationLead(),
      ...unreadable ? { unreadable: AUTOMATION_UNREADABLE } : {},
      rules: list.rules.map((rule) => {
        const action = ruleAction(rule);
        return {
          id: rule.id,
          title: automationRuleTitle(rule),
          tone: automationStateTone(rule),
          when: ruleWhen(rule),
          next: {
            ...runsNext(rule) ? { term: PHONE_SETTINGS_WORDS.nextRun } : {},
            value: automationNextWords(rule)
          },
          ...action ? { action } : {}
        };
      }),
      ...list.rules.length === 0 && !unreadable ? { empty: PHONE_SETTINGS_WORDS.noAutomations(home) } : {},
      pauseAll: {
        label: settingsAutomationPauseAll(),
        ask: PHONE_SETTINGS_WORDS.pauseAllAsk(running),
        enabled: running > 0
      },
      foot: PHONE_SETTINGS_WORDS.automationsThere(home)
    };
  }
  function listenedOf(rule, view) {
    const spec = rule.spec;
    if (spec.kind !== "event") return void 0;
    const integration = view?.integrations.find((one) => one.id === spec.integration);
    const event = integration?.events?.find((one) => one.name === spec.event);
    if (!integration || !event) return void 0;
    return {
      when: rule.when ?? automationEventWords(event.label, integration.name),
      every: event.every,
      ...event.filters ? { filters: event.filters } : {}
    };
  }
  function automationRulePage(input) {
    const { rule, home, now } = input;
    const dates = input.dates ?? [];
    const projects = input.projects.filter((one) => !one.archived);
    const zone = automationZoneOf(rule.spec);
    const calendar = rule.spec.kind === "daily" || rule.spec.kind === "weekly";
    const prompt = previewPrompt(
      rule.spec,
      rule.prompt,
      rule.spec.kind === "once" ? [rule.spec.at] : dates,
      now
    );
    const action = ruleAction(rule);
    const listened = listenedOf(rule, input.integrations);
    return {
      id: rule.id,
      title: automationRuleTitle(rule),
      tone: automationStateTone(rule),
      state: automationStateWords(rule),
      notes: [
        ...rule.failing ? automationLooksFailingWords(rule.failing) : [],
        ...rule.stopped ? [PHONE_SETTINGS_WORDS.stoppedThere(rule.stopped, home)] : [],
        ...rule.state === "draft" && !rule.stopped ? [AUTOMATION_SHEET_WORDS.draftNote] : [],
        ...rule.captainRequested ? [] : [PHONE_SETTINGS_WORDS.byFirstMate]
      ],
      facts: [
        { term: settingsAutomationWhen(), value: ruleWhen(rule) },
        ...calendar ? [
          {
            term: settingsAutomationTimeZone(),
            value: zone ? automationZoneWords(zone) : localClockWords(home)
          }
        ] : [],
        // What an event rule waits for, which a skipped look's note in the runs below refers to.
        ...rule.spec.kind === "event" && rule.spec.waitsFor ? [{ term: automationWaitsFor(), value: rule.spec.waitsFor }] : [],
        { term: settingsAutomationProject(), value: ruleProjectWords(rule.projectId, projects) },
        // The state above already says why a rule has no next run.
        ...runsNext(rule) ? [{ term: PHONE_SETTINGS_WORDS.nextRun, value: automationNextWords(rule) }] : [],
        ...rule.lastFired !== null ? [{ term: PHONE_SETTINGS_WORDS.lastRan, value: automationDateWords(rule.lastFired) }] : [],
        // The prompt names its scheduled time from the next dates, so it waits for them.
        ...input.dates === null ? [] : [{ term: settingsAutomationFirstMateGets(), value: prompt, prompt: true }]
      ],
      ...action ? { action } : {},
      ...action?.id === "review" ? {
        review: {
          title: settingsAutomationTurnOnQuestion(),
          facts: reviewFacts(
            { spec: rule.spec, dates, prompt, projectId: rule.projectId, listened },
            projects,
            home
          ),
          turnOn: settingsAutomationTurnOn(),
          back: settingsAutomationBack(),
          canTurnOn: reviewCanTurnOn(rule.spec, dates),
          save: {
            id: rule.id,
            name: rule.name ?? "",
            spec: rule.spec,
            prompt: rule.prompt,
            ...rule.projectId ? { projectId: rule.projectId } : {},
            enable: true
          }
        }
      } : {},
      history: {
        title: settingsAutomationHistory(),
        empty: settingsAutomationNothingRun(),
        ledTo: settingsAutomationLedTo(),
        read: input.runs !== null,
        runs: (input.runs ?? []).map((run) => {
          const note = deliveryNote(run);
          return {
            id: run.id,
            tone: DELIVERY_TONES[run.delivery],
            state: runStateWords(run),
            line: `${runWords(run)} · ${settingsAutomationVersion({ version: String(run.revision) })}`,
            ...note ? { note } : {},
            led: [
              ...run.tasks.map((task) => `${task.key} ${task.title}`),
              ...run.cards.map(
                (card) => card.open ? settingsAutomationCard({ title: card.title }) : settingsAutomationPastCard({ title: card.title })
              )
            ],
            promptTitle: runPromptTitle(run),
            prompt: run.prompt
          };
        })
      },
      foot: PHONE_SETTINGS_WORDS.automationsThere(home)
    };
  }
  function usagePage(input) {
    const { summary, unit, home } = input;
    const values = summary.days.map((day) => usageValue(day.amount, unit) ?? 0);
    const max = Math.max(0, ...values);
    const where = whereRows(
      summary.where,
      unit,
      summary.query.scope === "all" || summary.query.scope === "firstmate"
    );
    const first = summary.days[0]?.date;
    const last = summary.days.at(-1)?.date;
    return {
      summary: usageSummaryLine(summary),
      periods: Object.keys(PERIOD_WORDS).map((value) => ({
        value,
        label: PERIOD_WORDS[value]
      })),
      units: Object.keys(UNIT_WORDS).map((value) => ({
        value,
        label: UNIT_WORDS[value]
      })),
      period: summary.query.period,
      unit,
      label: periodLabel(summary),
      ...summary.total.records === 0 ? {
        empty: { title: settingsUsageEmptyTitle(), line: settingsUsageEmptyLead() }
      } : {},
      readouts: readouts(summary, unit),
      daily: {
        title: settingsUsageDailyHeading(),
        note: settingsPhoneTodayPartial(),
        first: first ? shortDate(first) : "",
        last: last ? shortDate(last) : "",
        peak: formatAmount(
          summary.days.reduce(
            (best, day) => (usageValue(day.amount, unit) ?? 0) > (usageValue(best, unit) ?? 0) ? day.amount : best,
            summary.days[0]?.amount ?? summary.total
          ),
          unit
        ),
        bars: summary.days.map((day, index) => ({
          date: shortDate(day.date),
          share: max > 0 ? (values[index] ?? 0) / max : 0,
          value: formatRecorded(day.amount, unit)
        }))
      },
      models: {
        title: unit === "usd" ? settingsUsageModelsUsd() : settingsUsageModelsTokens(),
        rows: sortedModels(summary.models, unit).map((model) => ({
          id: model.id,
          name: modelName(model),
          line: modelLine(model),
          value: formatAmount(model.amount, unit)
        }))
      },
      where: {
        title: settingsUsageWhereHeading(),
        legend: settingsUsageWhereLegend(),
        rows: [
          ...where.firstmate ? [
            {
              id: "firstmate",
              name: SCOPE_WORDS.firstmate,
              value: formatRecorded(where.firstmate, unit),
              depth: 0
            }
          ] : [],
          ...where.projects.flatMap((project) => [
            {
              id: `project:${project.key}`,
              name: project.name,
              value: formatAmount(project.amount, unit),
              depth: 0
            },
            ...project.kinds.map((kind) => ({
              id: `project:${project.key}:${kind.key}`,
              name: kind.name,
              value: formatAmount(kind.amount, unit),
              depth: 1
            }))
          ]),
          ...where.other ? [
            {
              id: "other",
              name: SCOPE_WORDS.other,
              value: formatAmount(where.other, unit),
              depth: 0
            }
          ] : []
        ]
      },
      milestone: milestoneWords(summary.finishedEver),
      foot: PHONE_SETTINGS_WORDS.usageThere(home)
    };
  }
  function costOf(limit) {
    if (limit === void 0) return void 0;
    return {
      title: PROJECT_COST_WORDS.title,
      description: PROJECT_COST_WORDS.description,
      value: !limit ? "follow" : "usd" in limit ? "amount" : "none",
      choices: PROJECT_COST_WORDS.choices.map((choice) => ({ ...choice })),
      usd: limit && "usd" in limit ? limit.usd : COST_LIMIT_DEFAULT_USD,
      amountLabel: PROJECT_COST_WORDS.amount,
      save: PHONE_SETTINGS_WORDS.save
    };
  }
  function projectsPage(input) {
    const { repos, folder, devices, home } = input;
    const entries = projectEntries(repos, input.projects ?? []);
    const groupOf = /* @__PURE__ */ new Map();
    for (const entry of entries)
      if (entry.kind === "several")
        for (const repo of entry.repos)
          groupOf.set(repo.id, {
            id: entry.project.id,
            name: entry.project.name,
            line: `${entry.project.key} · ${settingsProjectsRepositoryCount({ count: entry.repos.length })}`
          });
    const ordered = entries.flatMap((entry) => entry.kind === "one" ? [entry.repo] : entry.repos);
    const projects = ordered.map((repo) => {
      const group = groupOf.get(repo.id);
      const personal = repo.kind === "personal";
      const computers = devices?.length || repo.kind === "project" && repo.origin ? devices ?? [] : null;
      const words = projectRowWords(repo, folder, computers ? runsOnWhere(repo, computers) : null);
      const cost = personal ? void 0 : costOf(repo.costLimit);
      return {
        id: repo.id,
        name: repo.name,
        ...group ? { group } : {},
        line: words.join(" · "),
        ...!personal && folder !== null && words.includes(PROJECT_ROW_WORDS.linked) ? { path: repo.path } : {},
        personal,
        delivery: {
          title: PROJECT_POLICY_WORDS.deliveryTitle(personal),
          description: personal ? PROJECT_POLICY_WORDS.workspace : PROJECT_POLICY_WORDS.delivery(
            repo.batchesOffered !== false || repo.delivery === "queue-pr"
          ),
          ...personal ? { fixed: PROJECT_ROW_WORDS.personal } : {},
          value: repo.delivery,
          choices: personal ? [] : projectDeliveryChoices(repo).map((value) => ({
            value,
            label: PROJECT_DELIVERY_WORDS[value]
          }))
        },
        asks: {
          title: AUTONOMY_SWITCH_NAME,
          label: repo.autonomy ? AUTONOMY_WORDS.putsInItself : AUTONOMY_WORDS.asksFirst,
          description: PROJECT_POLICY_WORDS.asks(personal, repo.autonomy),
          fixed: personal,
          asksFirst: !repo.autonomy
        },
        rigor: {
          title: PROJECT_POLICY_WORDS.rigorTitle,
          description: PROJECT_POLICY_WORDS.rigor(personal),
          ...personal ? { fixed: PROJECT_POLICY_WORDS.rigorNone } : {},
          value: repo.rigor ?? "standard",
          choices: personal ? [] : ["quick", "standard", "reviewed"].map((value) => ({
            value,
            label: RIGOR_WORDS[value]
          }))
        },
        ...cost ? { cost } : {},
        notes: personal ? [] : [
          ...repo.batchesOffered !== false && repo.origin && repo.host && !hostTakesBatches(repo.host) ? [{ text: batchNoHostWords(), warn: false }] : [],
          ...repo.delivery === "local-only" && repo.rigor === "reviewed" ? [{ text: PROJECT_POLICY_WORDS.carefulLocal, warn: true }] : []
        ]
      };
    });
    return {
      summary: projectsSummary(
        entries.map((entry) => entry.kind === "one" ? entry.repo : entry.repos[0])
      ),
      projects,
      ...repos.every((repo) => repo.kind === "personal") ? { empty: PHONE_SETTINGS_WORDS.noProjects(home) } : {},
      foot: PHONE_SETTINGS_WORDS.projectsThere(home)
    };
  }
  function runbooksPage(input) {
    const { books, home } = input;
    const row = (book) => ({
      id: book.id,
      name: book.name,
      description: book.description,
      enabled: book.enabled,
      ...book.error ? { error: book.error } : {}
    });
    const builtin = books.filter((book) => book.source === "builtin");
    const yours = books.filter((book) => book.source !== "builtin");
    return {
      summary: runbooksSummary(books),
      lead: PHONE_SETTINGS_WORDS.runbooksLead,
      groups: [
        { id: "builtin", label: settingsRunbooksBuiltIn(), books: builtin.map(row) },
        {
          id: "yours",
          label: settingsRunbooksYours(),
          ...yours.length === 0 ? { empty: settingsRunbooksYoursEmpty() } : {},
          books: yours.map(row)
        }
      ],
      foot: settingsRunbooksFolderRemote({ computer: home })
    };
  }
  const PHONE_PAGES = {
    intelligence: intelligencePage,
    automation: automationPage,
    automationRule: automationRulePage,
    usage: usagePage,
    projects: projectsPage,
    runbooks: runbooksPage
  };
  function phonePage(name, input) {
    const page2 = PHONE_PAGES[name];
    if (!page2) throw new Error(`No Settings page is named ${name}`);
    return JSON.stringify(page2(JSON.parse(input)));
  }
  const page = phonePage;
  const language = setCurrentLanguage;
  exports.language = language;
  exports.page = page;
  Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
  return exports;
})({});
