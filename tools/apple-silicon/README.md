# Native Apple Silicon for BepInEx 5 games (experimental, opt-in)

Many Unity games ship a universal (arm64 + x86_64) Mac build, but with BepInEx 5 mods r2modmac falls back to Rosetta.
This tool lets those games run natively with mods.

## Why it fell back to Rosetta

BepInEx 5's Harmony patches game methods through MonoMod (legacy, 22.x). MonoMod makes a method's compiled code
writable with `mprotect(RWX)`. On Apple Silicon that code lives in `MAP_JIT` memory: a thread may only write to it after
`pthread_jit_write_protect_np(0)`, and while that write mode is on, the thread can't execute any `MAP_JIT` code.
MonoMod's first self-test fails, `DetourHelper.Runtime` stays null, and the preloader dies in
`HarmonyInteropFix.Apply` → `DetourHelper.GetIdentifiable` (`NullReferenceException`). The launcher's preloader-crash
check then pins the game to x64.

## What this adds

- `jitwrite.c` → `libjitwrite.dylib` (arm64): does each write to code entirely in native code: unlock, `memcpy`, lock,
  `sys_icache_invalidate`. It has to be native: managed code is itself `MAP_JIT` code and can't run while writes are on.
- `AppleSiliconMods.dll`: Doorstop's `Doorstop.Entrypoint.Start`. It sets MonoMod's `DetourHelper.Native` to a platform
  that writes MonoMod's own AArch64 jump (`ldr x15, #8; br x15; .quad target`) through `libjitwrite`. It then restores
  `DOORSTOP_INVOKE_DLL_PATH` to BepInEx's preloader (Doorstop sets it to the assembly it started) and calls BepInEx's
  entry point. Under Rosetta, or if anything in the setup fails, BepInEx starts exactly as before.
- The launcher (`script_template_prelude.sh`) points Doorstop at `<game>/apple_silicon/AppleSiliconMods.dll` when the
  runtime arch is arm64 and that file exists. Nothing changes for games without it, and the x64 crash fallback still
  applies.
- `install.sh` adds UnityDoorstop 4.5.0's universal `libdoorstop.dylib` beside the game: packs often ship only
  `doorstop_libs/libdoorstop_x64.dylib`. The download is pinned by SHA-256.

## Use

Needs Xcode's command line tools and the .NET SDK.

```sh
tools/apple-silicon/build.sh
tools/apple-silicon/install.sh "<game folder>"        # e.g. ~/Library/Application Support/Steam/steamapps/common/Valheim
```

Then launch the game with mods from r2modmac. `<game>/apple_silicon/apple_silicon.log` should say "Native Apple
Silicon: MonoMod writes code through libjitwrite", and `BepInEx/LogOutput.log` should reach "Chainloader startup
complete". `install.sh --remove "<game folder>"` undoes it. To compare with Rosetta for one launch, copy
`<game>/.r2modmac_codesign_state` to `<game>/.r2modmac_force_x64_state`; delete that file to go back to native.

## Tested

Valheim 1.0.20 (BepInExPack Valheim 5.4.2351 = BepInEx 5.4.23.5, MonoMod 22.1.29.1), 5 mods, M4 Pro, macOS 26:
- native arm64 process, all 5 plugins loaded, played online;
- world load 12–13 s native vs 31 s under Rosetta;
- in-world FPS the same (GPU-bound scene).

Only BepInEx 5 with legacy MonoMod is covered. Don't install it for BepInEx 6 games: their preloader has another
name, and their MonoMod (MonoMod.Core) works differently.
