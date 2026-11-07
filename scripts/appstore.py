"""Small App Store Connect API client for Shopping List - Scan & Shop (official API only).

Adapted from Off-hours' scripts/appstore.py.

Needs an App Store Connect API key (App Manager role) saved as
~/.appstoreconnect/private_keys/AuthKey_<KEY_ID>.p8 and `pip install pyjwt cryptography`.
The key is only read to sign requests; it is never printed.

    export ASC_KEY_ID=… ASC_ISSUER_ID=…
    python3 scripts/appstore.py version 1.1                          # create the next version
    python3 scripts/appstore.py status
    python3 scripts/appstore.py screenshots de pt-PT pt-BR          # upload into empty sets
    python3 scripts/appstore.py screenshots de --replace             # replace existing ones
    python3 scripts/appstore.py screenshots de --size=6.9            # the 6.9" slot (screenshots/appstore-6.9)
    python3 scripts/appstore.py remove-screenshots APP_IPHONE_65     # drop an outdated size
    python3 scripts/appstore.py assets de pt-PT pt-BR               # header + search results images
    python3 scripts/appstore.py listing sv da                        # name, subtitle, description, keywords, …
    python3 scripts/appstore.py submit                               # submit the editable version for review
"""

from __future__ import annotations

import hashlib
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

import jwt

ROOT = Path(__file__).resolve().parent.parent
APP_ID = "6806826182"  # Shopping List - Scan & Shop (ch.benn0r.shoppinglist)
API = "https://api.appstoreconnect.apple.com/v1"
# 1206×2622 screenshots belong to the 6.1"/6.3" iPhone slot ("iPhone with Dynamic Island").
DISPLAY_TYPE = "APP_IPHONE_61"
# 1320×2868 screenshots (iPhone 17 Pro Max, `SIZE=6.9 scripts/screenshots.sh all`) fill the 6.9" slot.
DISPLAY_TYPES = {"6.1": ("APP_IPHONE_61", "screenshots/appstore"), "6.9": ("APP_IPHONE_67", "screenshots/appstore-6.9")}
SCREENS = ["1-list", "2-online", "3-scanner", "4-product", "5-shopping"]  # scripts/screenshots.sh
# Folder name in screenshots/appstore → App Store Connect locale.
LOCALES = {
    "en": "en-US",
    "de": "de-DE",
    "fr": "fr-FR",
    "it": "it",
    "es": "es-ES",
    "nl": "nl-NL",
    "pt-PT": "pt-PT",
    "pt-BR": "pt-BR",
    "sv": "sv",
    "da": "da",
    "nb": "no",
    "fi": "fi",
    "ja": "ja",
    "pl": "pl",
}
# Folder → language prefix of the pages on shopping-list.tueftli.com (home, support, privacy).
SITE_LOCALES = {"pt-PT": "pt-pt", "pt-BR": "pt-br"}


def site_url(folder: str, page: str = "") -> str:
    prefix = SITE_LOCALES.get(folder, folder)
    return f"https://shopping-list.tueftli.com/{prefix}/{page + '/' if page else ''}"


def token() -> str:
    key_id = os.environ["ASC_KEY_ID"]
    issuer = os.environ["ASC_ISSUER_ID"]
    key = (Path.home() / ".appstoreconnect/private_keys" / f"AuthKey_{key_id}.p8").read_text()
    now = int(time.time())
    return jwt.encode(
        {"iss": issuer, "iat": now, "exp": now + 15 * 60, "aud": "appstoreconnect-v1"},
        key,
        algorithm="ES256",
        headers={"kid": key_id, "typ": "JWT"},
    )


def call(method: str, path: str, body: dict | None = None) -> dict:
    url = path if path.startswith("http") else API + path
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(url, data=data, method=method)
    request.add_header("Authorization", f"Bearer {token()}")
    if data is not None:
        request.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(request) as response:
            raw = response.read()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as error:
        detail = error.read().decode(errors="replace")[:600]
        raise SystemExit(f"{method} {path} → {error.code}\n{detail}") from None


def editable_version() -> dict:
    versions = call("GET", f"/apps/{APP_ID}/appStoreVersions?filter[platform]=IOS&limit=10")["data"]
    for version in versions:
        if version["attributes"]["appStoreState"] in {
            "PREPARE_FOR_SUBMISSION",
            "DEVELOPER_REJECTED",
            "REJECTED",
            "METADATA_REJECTED",
        }:
            return version
    raise SystemExit("No editable App Store version (it may be in review or released).")


def localizations(version_id: str) -> dict[str, str]:
    data = call("GET", f"/appStoreVersions/{version_id}/appStoreVersionLocalizations?limit=50")["data"]
    return {item["attributes"]["locale"]: item["id"] for item in data}


def screenshot_set(localization_id: str, display_type: str = DISPLAY_TYPE) -> tuple[str, list[str]]:
    sets = call(
        "GET",
        f"/appStoreVersionLocalizations/{localization_id}/appScreenshotSets"
        f"?filter[screenshotDisplayType]={display_type}&include=appScreenshots&limit=10",
    )
    for item in sets["data"]:
        shots = [s["id"] for s in item["relationships"]["appScreenshots"].get("data", [])]
        return item["id"], shots
    created = call(
        "POST",
        "/appScreenshotSets",
        {
            "data": {
                "type": "appScreenshotSets",
                "attributes": {"screenshotDisplayType": display_type},
                "relationships": {
                    "appStoreVersionLocalization": {
                        "data": {"type": "appStoreVersionLocalizations", "id": localization_id}
                    }
                },
            }
        },
    )
    return created["data"]["id"], []


def upload(set_id: str, file: Path) -> str:
    content = file.read_bytes()
    reservation = call(
        "POST",
        "/appScreenshots",
        {
            "data": {
                "type": "appScreenshots",
                "attributes": {"fileName": file.name, "fileSize": len(content)},
                "relationships": {"appScreenshotSet": {"data": {"type": "appScreenshotSets", "id": set_id}}},
            }
        },
    )["data"]
    for operation in reservation["attributes"]["uploadOperations"]:
        chunk = content[operation["offset"] : operation["offset"] + operation["length"]]
        request = urllib.request.Request(operation["url"], data=chunk, method=operation["method"])
        for header in operation.get("requestHeaders", []):
            request.add_header(header["name"], header["value"])
        with urllib.request.urlopen(request):
            pass
    call(
        "PATCH",
        f"/appScreenshots/{reservation['id']}",
        {
            "data": {
                "type": "appScreenshots",
                "id": reservation["id"],
                "attributes": {"uploaded": True, "sourceFileChecksum": hashlib.md5(content).hexdigest()},
            }
        },
    )
    return reservation["id"]


def wait_until_processed(ids: list[str]) -> dict[str, str]:
    states: dict[str, str] = {}
    for _ in range(60):
        for shot_id in ids:
            delivery = call("GET", f"/appScreenshots/{shot_id}")["data"]["attributes"]["assetDeliveryState"]
            states[shot_id] = delivery["state"]
            if delivery["state"] == "FAILED":
                raise SystemExit(f"Screenshot {shot_id} failed: {delivery.get('errors')}")
        if all(state == "COMPLETE" for state in states.values()):
            break
        time.sleep(3)
    return states


def screenshots(folders: list[str], replace: bool, size: str = "6.1") -> None:
    display_type, root = DISPLAY_TYPES[size]
    version = editable_version()
    locs = localizations(version["id"])
    for folder in folders:
        locale = LOCALES[folder]
        if locale not in locs:
            print(f"{folder}: no {locale} localization on version {version['attributes']['versionString']}")
            continue
        set_id, existing = screenshot_set(locs[locale], display_type)
        if existing and not replace:
            print(f"{folder}: {len(existing)} screenshots already there, skipped (use --replace)")
            continue
        for shot_id in existing:
            call("DELETE", f"/appScreenshots/{shot_id}")
        source = ROOT / root / ("" if folder == "en" else folder)
        ids = [upload(set_id, source / f"{name}.png") for name in SCREENS]
        states = wait_until_processed(ids)
        call(
            "PATCH",
            f"/appScreenshotSets/{set_id}/relationships/appScreenshots",
            {"data": [{"type": "appScreenshots", "id": shot_id} for shot_id in ids]},
        )
        done = sum(state == "COMPLETE" for state in states.values())
        print(f"{folder} ({locale}): uploaded {len(ids)} {size}\" screenshots, {done} processed")


def remove_screenshots(display_type: str) -> None:
    """Deletes one display size's screenshots from every localization of the editable version."""
    version = editable_version()
    for locale, localization_id in sorted(localizations(version["id"]).items()):
        sets = call(
            "GET",
            f"/appStoreVersionLocalizations/{localization_id}/appScreenshotSets"
            f"?filter[screenshotDisplayType]={display_type}&limit=10",
        )["data"]
        for item in sets:
            call("DELETE", f"/appScreenshotSets/{item['id']}")
            print(f"{locale}: removed the {display_type} screenshots")


# Creative assets: header and search results images live in the app's asset library and are
# attached to a localization as "placements".
ASSETS = {
    "PRODUCT_PAGE_HEADER_ASSET": "header-3840x1646.png",
    "APP_STORE_SEARCH_RESULTS_ASSET": "search-results-1920x1280.png",
}


def upload_library_image(file: Path) -> str:
    content = file.read_bytes()
    image = call(
        "POST",
        "/appAssetLibraryImages",
        {
            "data": {
                "type": "appAssetLibraryImages",
                "attributes": {"fileName": file.name, "fileSize": len(content), "category": "CREATIVE_ASSETS"},
                "relationships": {"assetLibrary": {"data": {"type": "appAssetLibraries", "id": APP_ID}}},
            }
        },
    )["data"]
    for operation in image["attributes"]["uploadOperations"]:
        chunk = content[operation["offset"] : operation["offset"] + operation["length"]]
        request = urllib.request.Request(operation["url"], data=chunk, method=operation["method"])
        for header in operation.get("requestHeaders", []):
            request.add_header(header["name"], header["value"])
        with urllib.request.urlopen(request):
            pass
    call(
        "PATCH",
        f"/appAssetLibraryImages/{image['id']}",
        {"data": {"type": "appAssetLibraryImages", "id": image["id"], "attributes": {"uploaded": True}}},
    )
    # Processing creative assets can take several minutes.
    for _ in range(200):
        attributes = call("GET", f"/appAssetLibraryImages/{image['id']}")["data"]["attributes"]
        if attributes.get("specId"):
            return image["id"]
        if attributes["state"] == "FAILED":
            raise SystemExit(f"{file.name} failed: {attributes.get('stateDetails')}")
        time.sleep(3)
    raise SystemExit(f"{file.name} was not processed in time")


def assets(folders: list[str], replace: bool) -> None:
    version = editable_version()
    locs = localizations(version["id"])
    for folder in folders:
        locale = LOCALES[folder]
        if locale not in locs:
            print(f"{folder}: no {locale} localization")
            continue
        placements = call("GET", f"/appStoreVersionLocalizations/{locs[locale]}/placements?limit=200")["data"]
        for placement_type, file_name in ASSETS.items():
            existing = [p for p in placements if p["attributes"]["placementType"] == placement_type]
            if existing and not replace:
                print(f"{folder}: {placement_type} already set, skipped (use --replace)")
                continue
            for placement in existing:
                call("DELETE", f"/appAssetLibraryPlacements/{placement['id']}")
            source = ROOT / "appstore/marketing" / ("" if folder == "en" else folder) / file_name
            image_id = upload_library_image(source)
            call(
                "POST",
                "/appAssetLibraryPlacements",
                {
                    "data": {
                        "type": "appAssetLibraryPlacements",
                        "attributes": {"placementType": placement_type, "placementGroup": "DEFAULT_PROFILE"},
                        "relationships": {
                            "image": {"data": {"type": "appAssetLibraryImages", "id": image_id}},
                            "appStoreVersionLocalization": {
                                "data": {"type": "appStoreVersionLocalizations", "id": locs[locale]}
                            },
                        },
                    }
                },
            )
            print(f"{folder} ({locale}): {placement_type} set from {file_name}")


def listing(folders: list[str]) -> None:
    """Creates or updates the localized listing from appstore/<folder>/*.txt."""
    # While a new version is being prepared, the app has two app infos: the live one (read-only)
    # and an editable one, which takes the localizations.
    infos = call("GET", f"/apps/{APP_ID}/appInfos")["data"]
    live = {"READY_FOR_SALE", "READY_FOR_DISTRIBUTION", "REPLACED_WITH_NEW_INFO"}
    editable = [i for i in infos if (i["attributes"].get("state") or i["attributes"].get("appStoreState")) not in live]
    app_info = (editable or infos)[0]["id"]
    info_locs = {
        item["attributes"]["locale"]: item["id"]
        for item in call("GET", f"/appInfos/{app_info}/appInfoLocalizations?limit=50")["data"]
    }
    version = editable_version()
    for folder in folders:
        try:
            listing_one(folder, app_info, info_locs, version)
        except SystemExit as error:
            print(f"{folder}: FAILED {error}")


def listing_one(folder: str, app_info: str, info_locs: dict[str, str], version: dict) -> None:
    if True:
        locale = LOCALES[folder]
        source = ROOT / "appstore" / ("" if folder == "en" else folder)
        read = lambda name: (source / f"{name}.txt").read_text().strip()  # noqa: E731
        info = {"name": read("name"), "subtitle": read("subtitle"), "privacyPolicyUrl": site_url(folder, "privacy-policy")}
        if locale in info_locs:
            call(
                "PATCH",
                f"/appInfoLocalizations/{info_locs[locale]}",
                {"data": {"type": "appInfoLocalizations", "id": info_locs[locale], "attributes": info}},
            )
        else:
            call(
                "POST",
                "/appInfoLocalizations",
                {
                    "data": {
                        "type": "appInfoLocalizations",
                        "attributes": {"locale": locale, **info},
                        "relationships": {"appInfo": {"data": {"type": "appInfos", "id": app_info}}},
                    }
                },
            )
        attributes = {
            "description": read("description"),
            "keywords": read("keywords"),
            "promotionalText": read("promotional-text"),
            "supportUrl": site_url(folder, "support"),
            "marketingUrl": site_url(folder),
        }
        # A first version has no "What's New".
        if version["attributes"]["versionString"] != "1.0":
            attributes["whatsNew"] = read("whats-new")
        # Creating the app info localization usually creates the version localization too.
        locs = localizations(version["id"])
        if locale in locs:
            call(
                "PATCH",
                f"/appStoreVersionLocalizations/{locs[locale]}",
                {"data": {"type": "appStoreVersionLocalizations", "id": locs[locale], "attributes": attributes}},
            )
        else:
            call(
                "POST",
                "/appStoreVersionLocalizations",
                {
                    "data": {
                        "type": "appStoreVersionLocalizations",
                        "attributes": {"locale": locale, **attributes},
                        "relationships": {"appStoreVersion": {"data": {"type": "appStoreVersions", "id": version["id"]}}},
                    }
                },
            )
        print(f"{folder} ({locale}): listing saved")


def create_version(version_string: str) -> None:
    """Creates the next App Store version; App Store Connect copies the previous version's listing."""
    versions = call("GET", f"/apps/{APP_ID}/appStoreVersions?filter[platform]=IOS&limit=10")["data"]
    for version in versions:
        if version["attributes"]["versionString"] == version_string:
            print(f"Version {version_string} already exists: {version['attributes']['appStoreState']}")
            return
    created = call(
        "POST",
        "/appStoreVersions",
        {
            "data": {
                "type": "appStoreVersions",
                "attributes": {"platform": "IOS", "versionString": version_string, "releaseType": "MANUAL"},
                "relationships": {"app": {"data": {"type": "apps", "id": APP_ID}}},
            }
        },
    )["data"]
    print(f"Version {version_string} created: {created['attributes']['appStoreState']}")


def attach_build(build_number: str) -> None:
    """Waits for an uploaded build to finish processing and attaches it to the editable version."""
    version = editable_version()
    version_string = version["attributes"]["versionString"]
    for _ in range(120):
        builds = call(
            "GET",
            f"/builds?filter[app]={APP_ID}&filter[version]={build_number}"
            f"&filter[preReleaseVersion.version]={version_string}&limit=5",
        )["data"]
        state = builds[0]["attributes"]["processingState"] if builds else "NOT_FOUND"
        if state == "VALID":
            break
        if state in {"FAILED", "INVALID"}:
            raise SystemExit(f"Build {build_number} is {state}")
        print(f"Build {build_number}: {state}, waiting…", flush=True)
        time.sleep(30)
    else:
        raise SystemExit(f"Build {build_number} was not processed in time")
    build = builds[0]
    # The app only uses HTTPS and Apple's frameworks: exempt from export compliance documentation.
    if build["attributes"].get("usesNonExemptEncryption") is None:
        call(
            "PATCH",
            f"/builds/{build['id']}",
            {"data": {"type": "builds", "id": build["id"], "attributes": {"usesNonExemptEncryption": False}}},
        )
    call(
        "PATCH",
        f"/appStoreVersions/{version['id']}/relationships/build",
        {"data": {"type": "builds", "id": build["id"]}},
    )
    print(f"Build {build_number} attached to version {version_string}")


def submit() -> None:
    version = editable_version()
    build = call("GET", f"/appStoreVersions/{version['id']}/build").get("data")
    if not build:
        raise SystemExit("No build attached to the version.")
    open_states = {"READY_FOR_REVIEW", "WAITING_FOR_REVIEW", "IN_REVIEW", "UNRESOLVED_ISSUES"}
    existing = [
        s
        for s in call("GET", f"/reviewSubmissions?filter[app]={APP_ID}&filter[platform]=IOS&limit=20")["data"]
        if s["attributes"]["state"] in open_states
    ]
    if existing and existing[0]["attributes"]["state"] != "READY_FOR_REVIEW":
        raise SystemExit(f"A submission is already {existing[0]['attributes']['state']}.")
    if existing:
        submission = existing[0]["id"]
    else:
        submission = call(
            "POST",
            "/reviewSubmissions",
            {
                "data": {
                    "type": "reviewSubmissions",
                    "attributes": {"platform": "IOS"},
                    "relationships": {"app": {"data": {"type": "apps", "id": APP_ID}}},
                }
            },
        )["data"]["id"]
        call(
            "POST",
            "/reviewSubmissionItems",
            {
                "data": {
                    "type": "reviewSubmissionItems",
                    "relationships": {
                        "reviewSubmission": {"data": {"type": "reviewSubmissions", "id": submission}},
                        "appStoreVersion": {"data": {"type": "appStoreVersions", "id": version["id"]}},
                    },
                }
            },
        )
    result = call(
        "PATCH",
        f"/reviewSubmissions/{submission}",
        {"data": {"type": "reviewSubmissions", "id": submission, "attributes": {"submitted": True}}},
    )["data"]["attributes"]
    print(
        f"Version {version['attributes']['versionString']} (build {build['attributes']['version']}) "
        f"submitted for review: {result['state']}"
    )


def status() -> None:
    version = editable_version()
    print(f"Version {version['attributes']['versionString']}: {version['attributes']['appStoreState']}")
    for locale, localization_id in sorted(localizations(version["id"]).items()):
        sets = call(
            "GET",
            f"/appStoreVersionLocalizations/{localization_id}/appScreenshotSets?include=appScreenshots&limit=20",
        )["data"]
        counts = {s["attributes"]["screenshotDisplayType"]: len(s["relationships"]["appScreenshots"]["data"]) for s in sets}
        placements = call("GET", f"/appStoreVersionLocalizations/{localization_id}/placements?limit=200")["data"]
        creative = sorted(
            {p["attributes"]["placementType"] for p in placements} & set(ASSETS)
        )
        print(f"  {locale:6} {counts or 'no screenshots'}  {', '.join(creative) or 'no header/search images'}")


if __name__ == "__main__":
    command, *args = sys.argv[1:] or ["status"]
    if command == "status":
        status()
    elif command == "assets":
        assets([a for a in args if not a.startswith("--")], replace="--replace" in args)
    elif command == "attach-build":
        attach_build(args[0])
    elif command == "version":
        create_version(args[0])
    elif command == "submit":
        submit()
    elif command == "listing":
        listing(args)
    elif command == "screenshots":
        size = next((a.split("=", 1)[1] for a in args if a.startswith("--size=")), "6.1")
        screenshots([a for a in args if not a.startswith("--")], replace="--replace" in args, size=size)
    elif command == "remove-screenshots":
        remove_screenshots(args[0])
    else:
        raise SystemExit(__doc__)
