# A computer being updated reads updating

A device on the home's list may carry `updating: true` while the home follows that computer's update, from its crew's pause until the update ends, as long as the computer was heard from in the last three minutes (`DeviceView.updating`, `src/shared/devices.ts`).
A task's place, a computer's sign-ins reading and each computer an Automatic start compared may carry the same `updating: true`, so every place that names the computer says updating rather than out of reach.
A view whose hello does not list this change is sent the device list without `updating`, since it reads a device strictly, and keeps saying out of reach or connecting.
A view from before ignores `updating` on a task's place, a sign-ins reading and a compared computer, and says what it said before.
