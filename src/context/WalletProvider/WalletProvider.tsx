import { ComponentWithAs, IconProps } from '@chakra-ui/react'
import { HDWallet, Keyring } from '@shapeshiftoss/hdwallet-core'
import * as native from '@shapeshiftoss/hdwallet-native'
import { NativeHDWallet } from '@shapeshiftoss/hdwallet-native'
import { getConfig } from 'config'
import { PublicWalletXpubs } from 'constants/PublicWalletXpubs'
import { ipcRenderer } from 'electron'
import findIndex from 'lodash/findIndex'
import omit from 'lodash/omit'
import React, { useCallback, useEffect, useMemo, useReducer } from 'react'
import { Entropy, VALID_ENTROPY } from 'context/WalletProvider/KeepKey/components/RecoverySettings'
import { useKeepKeyEventHandler } from 'context/WalletProvider/KeepKey/hooks/useKeepKeyEventHandler'
import { KeepKeyRoutes } from 'context/WalletProvider/routes'
import { useModal } from 'hooks/useModal/useModal'

import { ActionTypes, WalletActions } from './actions'
import { SUPPORTED_WALLETS } from './config'
import { KeepKeyService } from './KeepKey'
import { useKeyringEventHandler } from './KeepKey/hooks/useKeyringEventHandler'
import { PinMatrixRequestType } from './KeepKey/KeepKeyTypes'
import { KeyManager } from './KeyManager'
import {
  clearLocalWallet,
  getLocalWalletDeviceId,
  getLocalWalletType,
  setLocalNativeWalletName,
  setLocalWalletTypeAndDeviceId,
} from './local-wallet'
import { useNativeEventHandler } from './NativeWallet/hooks/useNativeEventHandler'
import { IWalletContext, WalletContext } from './WalletContext'
import { WalletViewsRouter } from './WalletViewsRouter'

const keepkey = new KeepKeyService()

type GenericAdapter = {
  initialize: (...args: any[]) => Promise<any>
  pairDevice: (...args: any[]) => Promise<HDWallet>
}

export type Adapters = Map<KeyManager, GenericAdapter>

export type WalletInfo = {
  name: string
  icon: ComponentWithAs<'svg', IconProps>
  deviceId: string
  meta?: { label?: string; address?: string }
}

export type WalletConnectApp = {
  name: string
  icons: Array<string>
  description: string
  url: string
}

export type Outcome = 'success' | 'error'
export type DeviceDisposition = 'initialized' | 'recovering' | 'initializing'

export type DeviceState = {
  awaitingDeviceInteraction: boolean
  lastDeviceInteractionStatus: Outcome | undefined
  disposition: DeviceDisposition | undefined
  recoverWithPassphrase: boolean | undefined
  recoveryEntropy: Entropy
  recoveryCharacterIndex: number | undefined
  recoveryWordIndex: number | undefined
}

const initialDeviceState: DeviceState = {
  awaitingDeviceInteraction: false,
  lastDeviceInteractionStatus: undefined,
  disposition: undefined,
  recoverWithPassphrase: undefined,
  recoveryEntropy: VALID_ENTROPY[0],
  recoveryCharacterIndex: undefined,
  recoveryWordIndex: undefined,
}

export interface InitialState {
  keyring: Keyring
  adapters: Adapters | null
  wallet: HDWallet | null
  type: KeyManager | null
  initialRoute: string | null
  walletInfo: WalletInfo | null
  keepkeyStatus: string | null
  keepkeyState: any //TODO why cant this be number?
  keepkey: any
  walletConnectApp: WalletConnectApp | null
  isConnected: boolean
  modal: boolean
  isLoadingLocalWallet: boolean
  deviceId: string
  showBackButton: boolean
  keepKeyPinRequestType: PinMatrixRequestType | null
  deviceState: DeviceState
}

const initialState: InitialState = {
  keyring: new Keyring(),
  adapters: null,
  wallet: null,
  type: null,
  keepkeyStatus: null,
  keepkeyState: 0,
  walletConnectApp: null,
  initialRoute: null,
  walletInfo: null,
  isConnected: false,
  keepkey: null,
  modal: false,
  isLoadingLocalWallet: false,
  deviceId: '',
  showBackButton: true,
  keepKeyPinRequestType: null,
  deviceState: initialDeviceState,
}

const reducer = (state: InitialState, action: ActionTypes) => {
  switch (action.type) {
    case WalletActions.SET_ADAPTERS:
      return { ...state, adapters: action.payload }
    case WalletActions.SET_WALLET:
      keepkey.pairWallet('keepkey', action.payload.wallet)

      return {
        ...state,
        wallet: action.payload.wallet,
        walletInfo: {
          name: action?.payload?.name,
          icon: action?.payload?.icon,
          deviceId: action?.payload?.deviceId,
          meta: {
            label: '', //TODO fixme
            address: (action.payload.wallet as any).ethAddress ?? '',
          },
        },
      }
    case WalletActions.SET_IS_CONNECTED:
      return { ...state, isConnected: action.payload }
    case WalletActions.SET_CONNECTOR_TYPE:
      return { ...state, type: action.payload }
    case WalletActions.SET_KEEPKEY_STATUS:
      return { ...state, keepkeyStatus: action.payload }
    case WalletActions.SET_KEEPKEY_STATE:
      return { ...state, keepkeyState: action.payload }
    case WalletActions.SET_INITIAL_ROUTE:
      return { ...state, initialRoute: action.payload }
    case WalletActions.SET_DEVICE_STATE:
      const { deviceState } = state
      const {
        awaitingDeviceInteraction = deviceState.awaitingDeviceInteraction,
        lastDeviceInteractionStatus = deviceState.lastDeviceInteractionStatus,
        disposition = deviceState.disposition,
        recoverWithPassphrase = deviceState.recoverWithPassphrase,
        recoveryEntropy = deviceState.recoveryEntropy,
      } = action.payload
      return {
        ...state,
        deviceState: {
          ...deviceState,
          awaitingDeviceInteraction,
          lastDeviceInteractionStatus,
          disposition,
          recoverWithPassphrase,
          recoveryEntropy,
        },
      }
    case WalletActions.SET_WALLET_MODAL:
      const newState = { ...state, modal: action.payload }
      // If we're closing the modal, then we need to forget the route we were on
      // Otherwise the connect button for last wallet we clicked on won't work
      if (!action.payload && state.modal) {
        newState.initialRoute = '/'
        newState.isLoadingLocalWallet = false
        newState.showBackButton = true
        newState.keepKeyPinRequestType = null
      }
      return newState
    case WalletActions.NATIVE_PASSWORD_OPEN:
      return {
        ...state,
        modal: action.payload.modal,
        type: KeyManager.Native,
        showBackButton: !state.isLoadingLocalWallet,
        deviceId: action.payload.deviceId,
        initialRoute: '/native/enter-password',
      }
    case WalletActions.OPEN_KEEPKEY_PIN: {
      const { showBackButton, deviceId, pinRequestType } = action.payload
      return {
        ...state,
        modal: true,
        type: KeyManager.KeepKey,
        showBackButton: showBackButton ?? false,
        deviceId,
        keepKeyPinRequestType: pinRequestType ?? null,
        initialRoute: KeepKeyRoutes.Pin,
      }
    }
    case WalletActions.OPEN_KEEPKEY_CHARACTER_REQUEST: {
      const { characterPos: recoveryCharacterIndex, wordPos: recoveryWordIndex } = action.payload
      const { deviceState } = state
      return {
        ...state,
        modal: true,
        showBackButton: false,
        type: KeyManager.KeepKey,
        initialRoute: KeepKeyRoutes.RecoverySentenceEntry,
        deviceState: {
          ...deviceState,
          recoveryCharacterIndex,
          recoveryWordIndex,
        },
      }
    }
    case WalletActions.OPEN_KEEPKEY_PASSPHRASE:
      return {
        ...state,
        modal: true,
        type: KeyManager.KeepKey,
        showBackButton: false,
        deviceId: action.payload.deviceId,
        initialRoute: KeepKeyRoutes.Passphrase,
      }
    case WalletActions.OPEN_KEEPKEY_INITIALIZE:
      return {
        ...state,
        modal: true,
        type: KeyManager.KeepKey,
        deviceId: action.payload.deviceId,
        initialRoute: KeepKeyRoutes.WipeSuccessful,
      }
    case WalletActions.OPEN_KEEPKEY_RECOVERY:
      return {
        ...state,
        modal: true,
        type: KeyManager.KeepKey,
        deviceId: action.payload.deviceId,
        initialRoute: KeepKeyRoutes.NewRecoverySentence,
      }
    case WalletActions.SET_LOCAL_WALLET_LOADING:
      return { ...state, isLoadingLocalWallet: action.payload }
    case WalletActions.SET_WALLET_CONNECT_APP:
      if (action.payload === null) ipcRenderer.send('@walletconnect/disconnect')
      return { ...state, walletConnectApp: action.payload }
    case WalletActions.RESET_STATE:
      const resetProperties = omit(initialState, ['keyring', 'adapters', 'modal', 'deviceId'])
      return { ...state, ...resetProperties }
    default:
      return state
  }
}

function playSound(type: any) {
  if (type === 'send') {
    const audio = new Audio(require('../../assets/sounds/send.mp3'))
    audio.play()
  }
  if (type === 'receive') {
    const audio = new Audio(require('../../assets/sounds/chaching.mp3'))
    audio.play()
  }
  if (type === 'success') {
    const audio = new Audio(require('../../assets/sounds/success.wav'))
    audio.play()
  }
  if (type === 'fail') {
    //eww nerf
    // const audio = new Audio(require('../../assets/sounds/fail.mp3'))
    // audio.play()
  }
}

const getInitialState = () => {
  const localWalletType = getLocalWalletType()
  const localWalletDeviceId = getLocalWalletDeviceId()
  if (localWalletType && localWalletDeviceId) {
    /**
     * set isLoadingLocalWallet->true to bypass splash screen
     */
    return {
      ...initialState,
      isLoadingLocalWallet: true,
    }
  }
  return initialState
}

export const WalletProvider = ({ children }: { children: React.ReactNode }): JSX.Element => {
  const [state, dispatch] = useReducer(reducer, getInitialState())
  const { sign, pair } = useModal()

  const disconnect = useCallback(() => {
    /**
     * in case of KeepKey placeholder wallet,
     * the disconnect function is undefined
     */
    state.wallet?.disconnect?.()
    dispatch({ type: WalletActions.RESET_STATE })
    clearLocalWallet()
  }, [state.wallet])

  const load = useCallback(() => {
    const localWalletType = getLocalWalletType()
    const localWalletDeviceId = getLocalWalletDeviceId()
    if (localWalletType && localWalletDeviceId && state.adapters) {
      ;(async () => {
        if (state.adapters?.has(localWalletType)) {
          switch (localWalletType) {
            case KeyManager.Native:
              const localNativeWallet = await state.adapters
                .get(KeyManager.Native)
                ?.pairDevice(localWalletDeviceId)
              if (localNativeWallet) {
                /**
                 * This will eventually fire an event, which the native wallet
                 * password modal will be shown
                 */
                await localNativeWallet.initialize()
              } else {
                disconnect()
              }
              break
            case KeyManager.KeepKey:
              try {
                const localKeepKeyWallet = state.keyring.get(localWalletDeviceId)
                /**
                 * if localKeepKeyWallet is not null it means
                 * KeepKey remained connected during the reload
                 */
                if (localKeepKeyWallet) {
                  const { name, icon } = SUPPORTED_WALLETS[KeyManager.KeepKey]
                  const deviceId = await localKeepKeyWallet.getDeviceID()
                  // This gets the firmware version needed for some KeepKey "supportsX" functions
                  await localKeepKeyWallet.getFeatures()
                  // Show the label from the wallet instead of a generic name
                  const label = (await localKeepKeyWallet.getLabel()) || name

                  await localKeepKeyWallet.initialize()

                  dispatch({
                    type: WalletActions.SET_WALLET,
                    payload: {
                      wallet: localKeepKeyWallet,
                      name: label,
                      icon,
                      deviceId,
                      meta: { label },
                    },
                  })
                  dispatch({ type: WalletActions.SET_IS_CONNECTED, payload: true })
                } else {
                  /**
                   * The KeepKey wallet is disconnected,
                   * because the accounts are not persisted, the app cannot load without getting pub keys from the
                   * wallet.
                   */
                  // TODO(ryankk): If persist is turned back on, we can restore the previous deleted code.
                  disconnect()
                }
              } catch (e) {
                disconnect()
              }
              dispatch({ type: WalletActions.SET_LOCAL_WALLET_LOADING, payload: false })
              break
            case KeyManager.Portis:
              const localPortisWallet = await state.adapters.get(KeyManager.Portis)?.pairDevice()
              if (localPortisWallet) {
                const { name, icon } = SUPPORTED_WALLETS[KeyManager.Portis]
                try {
                  await localPortisWallet.initialize()
                  const deviceId = await localPortisWallet.getDeviceID()
                  dispatch({
                    type: WalletActions.SET_WALLET,
                    payload: {
                      wallet: localPortisWallet,
                      name,
                      icon,
                      deviceId,
                    },
                  })
                  dispatch({ type: WalletActions.SET_IS_CONNECTED, payload: true })
                } catch (e) {
                  disconnect()
                }
              } else {
                disconnect()
              }
              dispatch({ type: WalletActions.SET_LOCAL_WALLET_LOADING, payload: false })
              break
            case KeyManager.MetaMask:
              const localMetaMaskWallet = await state.adapters
                .get(KeyManager.MetaMask)
                ?.pairDevice()
              if (localMetaMaskWallet) {
                const { name, icon } = SUPPORTED_WALLETS[KeyManager.MetaMask]
                try {
                  await localMetaMaskWallet.initialize()
                  const deviceId = await localMetaMaskWallet.getDeviceID()
                  dispatch({
                    type: WalletActions.SET_WALLET,
                    payload: {
                      wallet: localMetaMaskWallet,
                      name,
                      icon,
                      deviceId,
                    },
                  })
                  dispatch({ type: WalletActions.SET_IS_CONNECTED, payload: true })
                } catch (e) {
                  disconnect()
                }
              } else {
                disconnect()
              }
              dispatch({ type: WalletActions.SET_LOCAL_WALLET_LOADING, payload: false })
              break
            default:
              /**
               * The fall-through case also handles clearing
               * any demo wallet state on refresh/rerender.
               */
              disconnect()
              break
          }
        }
      })()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.adapters, state.keyring])

  useEffect(() => {
    if (state.keyring) {
      ;(async () => {
        const adapters: Adapters = new Map()
        let options: undefined | { portisAppId: string }
        for (const wallet of Object.values(KeyManager)) {
          try {
            options =
              wallet === 'portis'
                ? { portisAppId: getConfig().REACT_APP_PORTIS_DAPP_ID }
                : undefined
            const adapter = SUPPORTED_WALLETS[wallet].adapter.useKeyring(state.keyring, options)
            // useKeyring returns the instance of the adapter. We'll keep it for future reference.
            if (wallet === 'keepkey') {
              // TODO: add ability to pass serviceKey to adapter
              // const serviceKey = keepkey.getServiceKey()
              await adapter.pairDevice('http://localhost:1646')
              adapters.set(wallet, adapter)
            } else {
              await adapter.initialize()
              adapters.set(wallet, adapter)
            }
          } catch (e) {
            console.error('Error initializing HDWallet adapters', e)
          }
        }

        dispatch({ type: WalletActions.SET_ADAPTERS, payload: adapters })
      })()
    }
  }, [state.keyring])

  useEffect(() => {
    ipcRenderer.on('@walletconnect/paired', (_event, data) => {
      dispatch({ type: WalletActions.SET_WALLET_CONNECT_APP, payload: data })
    })

    //listen to events on main
    ipcRenderer.on('hardware', (_event, data) => {
      //event
      //console.log('hardware event: ', data)

      switch (data.event.event) {
        case 'connect':
          playSound('success')
          break
        case 'disconnect':
          playSound('fail')
          break
        default:
        //TODO Spammy
        //console.log("unhandled event! ",data.event)
      }
    })

    ipcRenderer.on('playSound', (_event, _data) => {})

    ipcRenderer.on('@keepkey/state', (_event, data) => {
      console.info('@keepkey/state', data)
      dispatch({ type: WalletActions.SET_KEEPKEY_STATE, payload: data.state })
    })

    ipcRenderer.on('@keepkey/status', (_event, data) => {
      dispatch({ type: WalletActions.SET_KEEPKEY_STATUS, payload: data.status })
    })

    ipcRenderer.on('approveOrigin', (_event: any, data: any) => {
      pair.open(data)
    })

    ipcRenderer.on('loadKeepKeyInfo', (_event, data) => {
      keepkey.updateFeatures(data.payload)
    })

    ipcRenderer.on('setUpdaterMode', (_event, _data) => {
      keepkey.setUpdaterMode()
    })

    ipcRenderer.on('setNeedsBootloaderUpdate', (_event, _data) => {
      keepkey.setNeedsBootloaderUpdate(true)
    })

    ipcRenderer.on('loadKeepKeyFirmwareLatest', (_event, data) => {
      keepkey.updateKeepKeyFirmwareLatest(data.payload)
    })

    ipcRenderer.on('onCompleteBootloaderUpload', (_event, _data) => {
      keepkey.setNeedsBootloaderUpdate(false)
    })

    // ipcRenderer.on('onCompleteFirmwareUpload', (event, data) => {
    //   firmware.close()
    // })

    // ipcRenderer.on('openFirmwareUpdate', (event, data) => {
    //   firmware.open({})
    // })

    // ipcRenderer.on('openBootloaderUpdate', (event, data) => {
    //   bootloader.open({})
    // })

    // ipcRenderer.on('closeBootloaderUpdate', (event, data) => {
    //   bootloader.close()
    // })

    //HDwallet API
    //TODO moveme into own file
    ipcRenderer.on('@hdwallet/getPublicKeys', async (_event, data) => {
      if (state.wallet) {
        // @ts-ignore
        let pubkeys = await state.wallet.getPublicKeys(data.payload.paths)
        console.info('pubkeys: ', pubkeys)
        ipcRenderer.send('@hdwallet/response/getPublicKeys', pubkeys)
      }
    })

    ipcRenderer.on('@hdwallet/btcGetAddress', async (_event, data) => {
      let payload = data.payload
      if (state.wallet) {
        console.info('state.wallet: ', state.wallet)
        console.info('payload: ', payload)
        // @ts-ignore
        let pubkeys = await state.wallet.btcGetAddress(payload)
        ipcRenderer.send('@hdwallet/response/btcGetAddress', pubkeys)
      }
    })

    ipcRenderer.on('@hdwallet/ethGetAddress', async (_event, data) => {
      let payload = data.payload
      if (state.wallet) {
        console.info('state.wallet: ', state.wallet)
        console.info('payload: ', payload)
        // @ts-ignore
        let pubkeys = await state.wallet.ethGetAddress(payload)
        ipcRenderer.send('@hdwallet/response/ethGetAddress', pubkeys)
      }
    })

    ipcRenderer.on('@hdwallet/thorchainGetAddress', async (_event, data) => {
      let payload = data.payload
      if (state.wallet) {
        console.info('state.wallet: ', state.wallet)
        // @ts-ignore
        let pubkeys = await state.wallet.thorchainGetAddress(payload)
        ipcRenderer.send('@hdwallet/response/thorchainGetAddress', pubkeys)
      }
    })

    ipcRenderer.on('@hdwallet/osmosisGetAddress', async (_event, data) => {
      let payload = data.payload
      if (state.wallet) {
        console.info('state.wallet: ', state.wallet)
        // @ts-ignore
        let pubkeys = await state.wallet.osmosisGetAddress(payload)
        ipcRenderer.send('@hdwallet/response/osmosisGetAddress', pubkeys)
      }
    })

    ipcRenderer.on('@hdwallet/binanceGetAddress', async (_event, data) => {
      let payload = data.payload
      if (state.wallet) {
        console.info('state.wallet: ', state.wallet)
        // @ts-ignore
        let pubkeys = await state.wallet.binanceGetAddress(payload)
        ipcRenderer.send('@hdwallet/response', pubkeys)
      } else {
        ipcRenderer.send('@hdwallet/response/binanceGetAddress', { error: 'wallet not online!' })
      }
    })

    ipcRenderer.on('@hdwallet/cosmosGetAddress', async (_event, data) => {
      let payload = data.payload
      if (state.wallet) {
        console.info('state.wallet: ', state.wallet)
        // @ts-ignore
        let pubkeys = await state.wallet.cosmosGetAddress(payload)
        ipcRenderer.send('@hdwallet/response', pubkeys)
      } else {
        ipcRenderer.send('@hdwallet/response/cosmosGetAddress', { error: 'wallet not online!' })
      }
    })

    //signTx
    ipcRenderer.on('@hdwallet/btcSignTx', async (_event, data) => {
      let HDwalletPayload = data.payload
      if (state.wallet) {
        console.info('state.wallet: ', state.wallet)
        // @ts-ignore
        let pubkeys = await state.wallet.btcSignTx(HDwalletPayload)
        ipcRenderer.send('@hdwallet/response/btcSignTx', pubkeys)
      }
    })

    ipcRenderer.on('@hdwallet/thorchainSignTx', async (_event, data) => {
      let HDwalletPayload = data.payload
      if (state.wallet) {
        console.info('state.wallet: ', state.wallet)
        // @ts-ignore
        let pubkeys = await state.wallet.thorchainSignTx(HDwalletPayload)
        ipcRenderer.send('@hdwallet/response/thorchainSignTx', pubkeys)
      }
    })

    ipcRenderer.on('@hdwallet/cosmosSignTx', async (_event, data) => {
      let HDwalletPayload = data.payload
      if (state.wallet) {
        console.info('state.wallet: ', state.wallet)
        // @ts-ignore
        let pubkeys = await state.wallet.thorchainSignTx(HDwalletPayload)
        ipcRenderer.send('@hdwallet/cosmosSignTx', pubkeys)
      }
    })

    ipcRenderer.on('@hdwallet/osmosisSignTx', async (_event, data) => {
      let HDwalletPayload = data.payload
      if (state.wallet) {
        console.info('state.wallet: ', state.wallet)
        // @ts-ignore
        let pubkeys = await state.wallet.osmosisSignTx(HDwalletPayload)
        ipcRenderer.send('@hdwallet/response/osmosisSignTx', pubkeys)
      }
    })

    ipcRenderer.on('@hdwallet/ethSignTx', async (_event, data) => {
      let HDwalletPayload = data.payload
      if (state.wallet) {
        console.info('state.wallet: ', state.wallet)
        // @ts-ignore
        let pubkeys = await state.wallet.ethSignTx(HDwalletPayload)
        ipcRenderer.send('@hdwallet/response/ethSignTx', pubkeys)
      }
    })

    //END HDwallet API

    ipcRenderer.on('setDevice', () => {})

    ipcRenderer.on('@account/sign-tx', async (_event: any, data: any) => {
      let unsignedTx = data.payload.data
      //open signTx
      if (
        unsignedTx &&
        unsignedTx.invocation &&
        unsignedTx.invocation.unsignedTx &&
        unsignedTx.invocation.unsignedTx.HDwalletPayload
      ) {
        sign.open({ unsignedTx, nonce: data.nonce })
      } else {
        console.error('INVALID SIGN PAYLOAD!', JSON.stringify(unsignedTx))
      }
    })

    //start keepkey
    async function startPioneer() {
      try {
        //keepkey
        await keepkey.init()
      } catch (e) {
        console.error(e)
      }
    }
    startPioneer()

    if (!state.wallet) {
      console.info('Starting bridge')
      ipcRenderer.send('@app/start', {
        username: keepkey.username,
        queryKey: keepkey.queryKey,
        spec: process.env.REACT_APP_URL_PIONEER_SPEC,
      })
    } else {
      ipcRenderer.send('@wallet/connected')
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.wallet]) // we explicitly only want this to happen once

  useEffect(() => {
    ipcRenderer.on('@wallet/not-initialized', (_event, deviceId) => {
      dispatch({
        type: WalletActions.OPEN_KEEPKEY_INITIALIZE,
        payload: {
          deviceId,
        },
      })
    })
  }, [])

  const connect = useCallback(async (type: KeyManager) => {
    dispatch({ type: WalletActions.SET_CONNECTOR_TYPE, payload: type })
    const routeIndex = findIndex(SUPPORTED_WALLETS[type]?.routes, ({ path }) =>
      String(path).endsWith('connect'),
    )
    if (routeIndex > -1) {
      dispatch({
        type: WalletActions.SET_INITIAL_ROUTE,
        payload: SUPPORTED_WALLETS[type].routes[routeIndex].path as string,
      })
    }
  }, [])

  const connectDemo = useCallback(async () => {
    const { name, icon, adapter } = SUPPORTED_WALLETS[KeyManager.Demo]
    // For the demo wallet, we use the name, DemoWallet, as the deviceId
    const deviceId = name
    setLocalWalletTypeAndDeviceId(KeyManager.Demo, deviceId)
    setLocalNativeWalletName(name)
    dispatch({ type: WalletActions.SET_LOCAL_WALLET_LOADING, payload: true })
    const adapterInstance = adapter.useKeyring(state.keyring)
    const wallet = (await adapterInstance.pairDevice(deviceId)) as NativeHDWallet
    const { create } = native.crypto.Isolation.Engines.Dummy.BIP39.Mnemonic
    await wallet.loadDevice({
      mnemonic: await create(PublicWalletXpubs),
      deviceId,
    })
    await wallet.initialize()
    dispatch({
      type: WalletActions.SET_WALLET,
      payload: {
        wallet,
        name,
        icon,
        deviceId,
        meta: { label: name },
      },
    })
    dispatch({ type: WalletActions.SET_IS_CONNECTED, payload: false })
    dispatch({ type: WalletActions.SET_LOCAL_WALLET_LOADING, payload: false })
  }, [state.keyring])

  const create = useCallback(async (type: KeyManager) => {
    dispatch({ type: WalletActions.SET_CONNECTOR_TYPE, payload: type })
    const routeIndex = findIndex(SUPPORTED_WALLETS[type]?.routes, ({ path }) =>
      String(path).endsWith('create'),
    )
    if (routeIndex > -1) {
      dispatch({
        type: WalletActions.SET_INITIAL_ROUTE,
        payload: SUPPORTED_WALLETS[type].routes[routeIndex].path as string,
      })
    }
  }, [])

  const setDeviceState = useCallback((deviceState: Partial<DeviceState>) => {
    dispatch({
      type: WalletActions.SET_DEVICE_STATE,
      payload: deviceState,
    })
  }, [])

  useEffect(() => load(), [load, state.adapters, state.keyring])

  useKeyringEventHandler(state)
  useNativeEventHandler(state, dispatch)
  useKeepKeyEventHandler(state, dispatch, load, setDeviceState)

  const value: IWalletContext = useMemo(
    () => ({
      state,
      dispatch,
      connect,
      create,
      disconnect,
      load,
      setDeviceState,
      connectDemo,
      keepkey,
    }),
    [state, connect, create, disconnect, load, setDeviceState, connectDemo],
  )

  return (
    <WalletContext.Provider value={value}>
      {children}
      <WalletViewsRouter />
    </WalletContext.Provider>
  )
}
