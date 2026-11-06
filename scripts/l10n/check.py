#!/usr/bin/env python3
"""Checks that every Localizable.strings file has exactly the keys in scripts/l10n/keys.json and
the same %@ / %lld placeholders as the English key. Run from the repository root."""
import json
import pathlib
import re
import sys

ENTRY = re.compile(r'^"((?:[^"\\]|\\.)*)"\s*=\s*"((?:[^"\\]|\\.)*)";', re.M)
PLACEHOLDER = re.compile(r"%(?:\d+\$)?(?:@|lld|d)")


def unescape(value: str) -> str:
    return value.replace('\\"', '"').replace("\\n", "\n").replace("\\\\", "\\")


def parse(path: pathlib.Path) -> dict[str, str]:
    return {unescape(k): unescape(v) for k, v in ENTRY.findall(path.read_text(encoding="utf-8"))}


def main() -> int:
    keys = json.loads(pathlib.Path("scripts/l10n/keys.json").read_text(encoding="utf-8"))
    failed = False
    for path in sorted(pathlib.Path("ShoppingListApp").glob("*.lproj/Localizable.strings")):
        language = path.parent.stem
        values = parse(path)
        missing = [k for k in keys if k not in values]
        extra = [k for k in values if k not in keys]
        wrong = [k for k in keys if k in values and sorted(PLACEHOLDER.findall(k)) != sorted(PLACEHOLDER.findall(values[k]))]
        empty = [k for k in keys if values.get(k, "x").strip() == ""]
        problems = [("missing", missing), ("unknown", extra), ("placeholder", wrong), ("empty", empty)]
        if any(found for _, found in problems):
            failed = True
            for name, found in problems:
                for key in found:
                    print(f"{language}: {name}: {key!r}")
        else:
            print(f"{language}: {len(keys)} strings OK")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
