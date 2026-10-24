# Native Apple Silicon for BepInEx 5 games (experimental)

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
- UnityDoorstop 4.5.0's universal `libdoorstop.dylib` goes beside the game (only if the loader there has no arm64):
  packs often ship only `doorstop_libs/libdoorstop_x64.dylib`. `build.sh` downloads it pinned by SHA-256, with its
  LGPL-2.1 license.

## How it gets to the game

**r2modmac's macOS release builds do it by themselves.** The release build runs `build.sh` and bundles `dist/` into
the app (`src-tauri/tauri.apple-silicon.conf.json`). Before each modded launch, r2modmac puts the files beside the game
(`apple_silicon.rs`), but only when all of these hold:
- the Mac is Apple Silicon;
- the game has an arm64 build;
- BepInEx/core has `BepInEx.Preloader.dll` that reads `DOORSTOP_INVOKE_DLL_PATH` (BepInEx 5.4.22 or later);
- BepInEx/core has `MonoMod.RuntimeDetour.dll`.

It removes an earlier shim if the game's BepInEx changes to one it can't start. It clears a Rosetta pin only the
first time (that pin came from the crash this fixes). Dev builds (`tauri dev`, plain `tauri build`) don't carry the
files, so nothing changes there. Anything that goes wrong is logged, and the launch goes on under Rosetta.

## By hand (builds without it)

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
