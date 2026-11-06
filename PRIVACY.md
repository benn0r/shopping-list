# Privacy Policy

Shopping List works entirely on your iPhone by default. The developer receives data only if you
choose Shopping List Cloud for a list. The app has no advertising, tracking, or analytics SDKs.

**Effective date: November 6, 2026**

## About this policy

This policy describes the data practices of Shopping List, an iPhone app. Shopping List is
an independent app for scanning product barcodes and maintaining a local shopping list, with
optional synchronization to Shopping List Cloud (operated by the developer), Bring, self-hosted
Mealie servers, and self-hosted Shopping List Servers. It is not affiliated with,
endorsed by, or sponsored by Bring! Labs AG, the Mealie project, or the Open Facts projects.

## Data collected by the developer

Only when you use Shopping List Cloud. Lists you keep "On this iPhone" are never sent to the
developer. Shopping List does not use advertising or analytics SDKs and does not track users across
apps or websites.

## Shopping List Cloud

Shopping List Cloud is optional. It is used only for lists you create in, or move to, Cloud, and
it requires Sign in with Apple. When you use it, the developer's server stores:

- an account identifier issued by Apple for this app, and the name Apple shares when you first
  sign in (your email address is not requested);
- the names of your Cloud lists and their items, including label, quantity, unit, and barcode when
  available, and whether an item is checked off; and
- a session token that lets the app access your account, and a token from Apple that the server
  uses to revoke Sign in with Apple when you delete your account.

The server uses item names to choose a category and an icon for each item. When no suitable icon
exists, it may send the item name, without your account details, to an image-generation service to
create one. Generated icons are not linked to your account and may be reused for anyone's items
with the same name. Like any web server, it also receives standard network information such as
your IP address and request time.

This information is used only to provide Cloud features: storing and syncing your Cloud lists,
showing icons and categories, and preventing abuse.

## Camera access

The app requests camera access only to recognize EAN and UPC barcodes. Camera frames are processed
on the device. Shopping List does not save photos or video and does not transmit camera frames to
the developer, Bring, or Open Facts services.

## Information stored on your device

The app stores only the information needed to work:

- your local shopping lists and their items, including barcode, label, brand and stores when
  available, quantity when selected, and scan time;
- which synchronization providers are enabled;
- your Bring, Mealie, or Shopping List Server credentials, and your Shopping List Cloud session,
  in the iOS Keychain;
- the provider and remote shopping-list mapping selected for each local list;
- custom barcode labels; and
- product-lookup and language preferences.

This information remains in private app storage on your device. Only the Cloud data listed above
is available to the developer. Store names shown for products are community-contributed metadata and may be incomplete
or outdated.

## Communication with synchronization providers

Provider synchronization is disabled by default. When you configure Bring, Mealie, or your own
Shopping List Server, the app
communicates directly with that provider. Depending on the provider and your action, it sends the
configured server address, credentials, list identifier, item label, quantity, unit, and optional
barcode metadata. For scanned items, the barcode may be included so another Shopping List
installation can retrieve the same public product metadata. Each provider controls its own
processing, retention, and deletion of this information.

## Product-information lookups

For a direct scan, and when a synchronized item contains a barcode marker added by Shopping List, the app
may send the barcode and a language and country code derived from your device locale to the Open
Facts product-information services. These include Open Food Facts, Open Products Facts, Open Beauty
Facts, and Open Pet Food Facts. Those services and their hosting providers may also receive standard
network information such as your IP address, request time, and user-agent information. Their own
privacy notices govern that processing.

## Sharing, sale, and tracking

The developer does not sell personal information, use it for advertising, create advertising
profiles, share it with data brokers, or track users. Information is sent only to Shopping List Cloud
when you use it, to a provider you configure, and to Open Facts when necessary to perform an action
you request.

## Retention and deletion

Shopping List Cloud data is kept until you delete it. Settings → Shopping List Cloud → Delete
Account permanently deletes your account and Cloud lists from the developer's server and revokes
Sign in with Apple; copies of your lists stay on your iPhone. Signing out keeps your Cloud data on
the server and keeps local copies on your iPhone. Disconnecting a provider removes its credentials
from the app. Custom labels can be deleted in Settings. Using an item's Remove button removes it from its
local shopping list. Deleting the app removes its other local data,
subject to iOS storage and backup behavior. Information sent to a configured provider or Open Facts
is subject to those services' retention and deletion practices. Provider account requests must be
directed to that provider because the developer cannot access or delete that account data.

## Security

Provider credentials and the Cloud session use the iOS Keychain. Other local records use the app's private
application storage, and network requests use HTTPS. No storage or transmission method can be
guaranteed to be completely secure.

## Children's privacy

Shopping List is a general-audience utility and is not directed specifically to children. The app
does not knowingly collect children's personal information through Shopping List Cloud.

## International processing

Shopping List Cloud, configured providers, and Open Facts may process information outside your
country. Their respective privacy notices
describe their processing locations and safeguards.

## Changes to this policy

This policy may be updated if the app's functionality or data practices change. The effective date
at the top of this page will be updated when material changes are made.

## Contact

For privacy questions, use the developer support contact listed on Shopping List's App Store page.
