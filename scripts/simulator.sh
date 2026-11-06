#!/usr/bin/env bash
# Prints the UDID of a dedicated simulator, creating it from a device type and booting it.
#   scripts/simulator.sh "Shopping List Tests" "iPhone 17 Pro"
# Other projects and sessions on this Mac share the regular simulators and can reinstall or kill
# apps on them mid-run; a simulator of our own keeps tests and screenshots undisturbed.
set -euo pipefail
name="$1"
template="${2:-iPhone 17 Pro}"

find_device() {
  xcrun simctl list devices available -j | python3 -c "
import json, sys
for runtime, devices in json.load(sys.stdin)['devices'].items():
    for d in devices:
        if d['name'] == sys.argv[1] and 'iOS' in runtime:
            print(d['udid']); sys.exit()" "$1"
}

udid=$(find_device "$name")
if [[ -z "$udid" ]]; then
  source_udid=$(find_device "$template")
  [[ -n "$source_udid" ]] || { echo "No available simulator named $template" >&2; exit 1; }
  type=$(xcrun simctl list devices -j | python3 -c "
import json, sys
for devices in json.load(sys.stdin)['devices'].values():
    for d in devices:
        if d['udid'] == sys.argv[1]: print(d['deviceTypeIdentifier'])" "$source_udid")
  udid=$(xcrun simctl create "$name" "$type")
fi
xcrun simctl boot "$udid" 2>/dev/null || true
xcrun simctl bootstatus "$udid" -b >/dev/null
echo "$udid"
