# Hathor Wallet Mobile

## Install

`npm install`

`npm run node-hack`

### Podfile install for iOS

#### Install cocoapods

Cocoapods is an iOS package manager. Sentry needs to add some native codes, so we must install an iOS native lib of Sentry.

Actually Apple already released a new package manager 'Swift Package Manager' but it's not supported for the React native version we use.

`sudo gem install cocoapods`

`cd ios && pod install`

### Sentry configuration

We use Sentry to allow users to send crash reports.

There is one file that must be created on ios and android folders. This file has a token used to upload some symbols to Sentry.
https://github.com/getsentry/sentry-react-native/issues/112#issuecomment-309980345

This token is only used when releasing an app version, no need to have it for development.

So you must create `ios/sentry.properties` and `android/sentry.properties` files with the following content in both:

```
defaults.url=https://sentry.io/
defaults.org=ORG-NAME
defaults.project=PROJECT-NAME
auth.token=YOUR-SENTRY-TOKEN
```

## Run

`npm run ios` to open on iOS simulator, or `npm run ios -- --simulator "iPhone 11"`

To list all available simulators, use `xcrun simctl list devices`.

### Run linter

`npm run lint`

## Translations

We use the `ttag` lib for i18n. Check out the docs [here](https://ttag.js.org/docs/quickstart.html).

Run `npm run locale-update-pot` to update the pot file (`locale/texts.pot`).

Run `msgmerge pt-br/texts.po texts.pot -o pt-br/texts.po` to merge a pot file with a po file.

Finally, run `make i18n` to compile all po files to json files.

## License

Code released under [the MIT license](https://github.com/HathorNetwork/hathor-wallet-mobile/blob/master/LICENSE).
