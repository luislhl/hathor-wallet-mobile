/**
 * Copyright (c) Hathor Labs and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import React from 'react';
import { connect } from 'react-redux';
import { t } from 'ttag';

import {
  BackHandler, SafeAreaView, Text, View,
} from 'react-native';
import * as Keychain from 'react-native-keychain';
import hathorLib from '@hathor/wallet-lib';
import SimpleButton from '../components/SimpleButton';
import PinInput from '../components/PinInput';
import Logo from '../components/Logo';
import { isBiometryEnabled, getSupportedBiometry, getWalletWords } from '../utils';
import {
  lockScreen,
  unlockScreen,
  setLoadHistoryStatus,
  setTempPin,
  onStartWalletLock,
  startWalletRequested,
  resetOnLockScreen,
} from '../actions';
import { PIN_SIZE } from '../constants';


/**
 * loadHistoryActive {bool} whether we still need to load history
 */
const mapStateToProps = (state) => ({
  loadHistoryActive: state.loadHistoryStatus.active,
  wallet: state.wallet,
});

const mapDispatchToProps = (dispatch) => ({
  unlockScreen: () => dispatch(unlockScreen()),
  lockScreen: () => dispatch(lockScreen()),
  resetOnLockScreen: () => dispatch(resetOnLockScreen()),
  setLoadHistoryStatus: (active, error) => dispatch(setLoadHistoryStatus(active, error)),
  setTempPin: (pin) => dispatch(setTempPin(pin)),
  onStartWalletLock: () => dispatch(onStartWalletLock()),
  startWalletRequested: (payload) => dispatch(startWalletRequested(payload)),
});

class PinScreen extends React.Component {
  static defaultProps = { isLockScreen: false };

  constructor(props) {
    super(props);
    /**
     * pin {string} Pin entered by the user
     * error {string} Error message (null if there's no error)
     */
    this.state = {
      pin: '',
      pinColor: 'black',
      error: null,
    };

    this.canCancel = false;
    this.screenText = t`Enter your PIN Code `;
    this.biometryText = t`Unlock Hathor Wallet`;
    if (!this.props.isLockScreen) {
      this.canCancel = props.navigation.getParam('canCancel', this.canCancel);
      this.screenText = props.navigation.getParam('screenText', this.screenText);
      this.biometryText = props.navigation.getParam('biometryText', this.biometryText);
    }

    this.willFocusEvent = null;
  }

  componentDidMount() {
    const supportedBiometry = getSupportedBiometry();
    const biometryEnabled = isBiometryEnabled();
    if (supportedBiometry && biometryEnabled) {
      this.askBiometricId();
    }

    if (!this.canCancel) {
      // If can't cancel this screen, we must remove the hardware back from android
      BackHandler.addEventListener('hardwareBackPress', this.handleBackButton);
    }

    this.willFocusEvent = this.props.navigation.addListener('willFocus', () => {
      this.setState({ pin: '', pinColor: 'black', error: null });
    });
  }

  componentWillUnmount() {
    if (!this.canCancel) {
      // Removing event listener
      BackHandler.removeEventListener('hardwareBackPress', this.handleBackButton);
    }

    // Removing focus event
    this.willFocusEvent.remove();
  }

  handleBackButton = () => true

  askBiometricId = async () => {
    try {
      /* getGenericPassword will return either `false` or UserCredentials:
       *
       * interface UserCredentials extends Result {
       *   username: string;
       *   password: string;
       * }
       */
      const credentials = await Keychain.getGenericPassword({
        authenticationPrompt: this.biometryText,
      });

      if (credentials !== false) {
        this.dismiss(credentials.password);
      }
    } catch (e) {
      // No need to do anything here as the user can type his PIN
    }
  }

  /**
   * Handle data migration on unlock screen
   * This method is executed when the wallet is unlocked, so we can check
   * if we need to change anything on the app data after an update
   *
   * @param {String} pin Unlock PIN written by the user
   */
  handleDataMigration = (pin) => {
    const accessData = hathorLib.wallet.getWalletAccessData();

    if (accessData !== null && accessData.xpubkey === undefined && accessData.mainKey) {
      // Two situations are handled here:
      // 1. From v0.12.0 to v0.13.0 of the lib, xpubkey has changed from wallet:data
      // to wallet:accessData. So if the user is still in an app version before v0.13.0,
      // we can't use xpubkey directly from accessData
      //
      // 2. When the user updated the app to the newest version directly from a version before we've
      // executed the xpubkey migration. In that case we have deleted the user walletData before
      // migrating the xpubkey to the accessData
      const xpubkey = hathorLib.wallet.getXPubKeyFromXPrivKey(pin);
      accessData.xpubkey = xpubkey;
      hathorLib.wallet.setWalletAccessData(accessData);
    }
  }

  dismiss = (pin) => {
    if (this.props.isLockScreen) {
      // in case it's the lock screen, we just have to execute the data migration
      // method an change redux state. No need to execute callback or go back on navigation
      this.handleDataMigration(pin);
      if (!this.props.wallet) {
        // Here we need to check if the user has the `acctPathMainKey` stored on his accessData
        // because he won't have it if he's migrating from any version before v0.18.0 directly into
        // version > v0.21.1. We only use it on the wallet-service facade, but dispatching
        // `startWalletRequested` once with the words instead of xpriv will update his storage to
        // contain it so if he ever switches to the wallet-service, it will load properly from it.
        const xpriv = hathorLib.wallet.getAcctPathXprivKey(pin);
        if (!xpriv) {
          const words = getWalletWords(pin);
          this.props.startWalletRequested({
            pin,
            words,
          });
        } else {
          // If we are here, the wallet has already been initialized in the past, so
          // we should load from xpriv
          this.props.startWalletRequested({
            pin,
            fromXpriv: true,
          });
        }
      }
      this.props.unlockScreen();
    } else {
      // dismiss the pin screen first because doing it after the callback can
      // end up dismissing the wrong screen
      this.props.navigation.goBack();
      // execute the callback passing the pin, if any cb was given
      const cb = this.props.navigation.getParam('cb', null);
      if (cb) {
        cb(pin);
      }
    }
  }

  onChangeText = (text) => {
    if (text.length > PIN_SIZE) {
      return;
    }

    if (text.length === PIN_SIZE) {
      setTimeout(() => this.validatePin(text), 300);
    }
    this.setState({ pin: text, pinColor: 'black', error: null });
  }

  validatePin = (pin) => {
    const pinCorrect = hathorLib.wallet.isPinCorrect(pin);

    if (!pinCorrect) {
      this.removeOneChar();
      return;
    }

    try {
      // Validate if we are able to decrypt the seed using this PIN
      // this will throw if the words are not able to be decoded with this
      // pin.
      hathorLib.wallet.getWalletWords(pin);

      if (!hathorLib.wallet.wordsValid(pin)) {
        throw new Error('Words not valid.');
      }
    } catch (e) {
      this.props.onExceptionCaptured(
        new Error('User inserted a valid PIN but the app wasn\'t able to decrypt the words'),
        true, // Fatal since we can't start the wallet
      );

      return;
    }

    // Inserted PIN was able to decrypt the words successfully
    this.dismiss(pin);
  }

  goToReset = () => {
    this.props.resetOnLockScreen();
  }

  /*
   * This function is used when coming back to lock screen from reset screen
   */
  backFromReset = () => {
    // set to same status as before
    this.props.setLoadHistoryStatus(this.props.loadHistoryActive, false);
    // show lock screen again
    this.props.lockScreen();
    // navigate to dashboard (will be hidden under lock screen)
    this.props.navigation.navigate('Dashboard');
  }

  removeOneChar = () => {
    const pin = this.state.pin.slice(0, -1);
    if (pin.length === 0) {
      this.setState({ pin: '', error: t`Incorrect PIN Code. Try again.` });
    } else {
      this.setState({ pin, pinColor: '#DE3535' });
      setTimeout(() => this.removeOneChar(), 25);
    }
  }

  render() {
    const renderButton = () => {
      let title;
      let onPress;
      if (this.canCancel) {
        title = t`Cancel`;
        onPress = () => this.props.navigation.goBack();
      } else {
        title = t`Reset wallet`;
        onPress = () => this.goToReset();
      }
      return (
        <SimpleButton
          onPress={onPress}
          title={title}
          textStyle={{
            textTransform: 'uppercase', color: 'rgba(0, 0, 0, 0.5)', letterSpacing: 1, padding: 4,
          }}
          containerStyle={{ marginTop: 16, marginBottom: 8 }}
        />
      );
    };

    return (
      <SafeAreaView style={{ flex: 1, alignItems: 'center', marginHorizontal: 16 }}>
        <View style={{ marginVertical: 16, alignItems: 'center', height: 21, width: 120 }}>
          <Logo
            style={{ height: 21, width: 120 }}
          />
        </View>
        <Text style={{ marginTop: 32, marginBottom: 16 }}>{this.screenText}</Text>
        <PinInput
          maxLength={PIN_SIZE}
          color={this.state.pinColor}
          value={this.state.pin}
          onChangeText={this.onChangeText}
          error={this.state.error}
        />
        {renderButton()}
      </SafeAreaView>
    );
  }
}

export default connect(mapStateToProps, mapDispatchToProps)(PinScreen);
