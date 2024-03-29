import {
  ChevronDownIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
  SettingsIcon,
  WarningTwoIcon,
} from '@chakra-ui/icons'
import { Menu, MenuButton, MenuGroup, MenuItem, MenuList } from '@chakra-ui/menu'
import { Button, Flex, HStack, Link, useColorModeValue } from '@chakra-ui/react'
import { FC, useEffect, useState } from 'react'
import { FaPuzzlePiece, FaWallet } from 'react-icons/fa'
import { useTranslate } from 'react-polyglot'
import { MemoryRouter, Route, Switch } from 'react-router-dom'
import { WalletConnectedRoutes } from 'components/Layout/Header/NavBar/hooks/useMenuRoutes'
import { WalletConnectedMenu } from 'components/Layout/Header/NavBar/WalletConnectedMenu'
import { WalletImage } from 'components/Layout/Header/NavBar/WalletImage'
import { MiddleEllipsis } from 'components/MiddleEllipsis/MiddleEllipsis'
import { RawText, Text } from 'components/Text'
import { WalletActions } from 'context/WalletProvider/actions'
import type { InitialState } from 'context/WalletProvider/WalletProvider'
import { useModal } from 'hooks/useModal/useModal'
import { useWallet } from 'hooks/useWallet/useWallet'
import { ensReverseLookup } from 'lib/ens'

export const entries = [WalletConnectedRoutes.Connected]

const NoWallet = ({ onClick }: { onClick: () => void }) => {
  const translate = useTranslate()
  return (
    <MenuGroup title={translate('common.noWallet')} ml={3} color='gray.500'>
      <MenuItem onClick={onClick} alignItems='center' justifyContent='space-between'>
        {translate('common.connectWallet')}
        <ChevronRightIcon />
      </MenuItem>
    </MenuGroup>
  )
}

export type WalletConnectedProps = {
  onDisconnect: () => void
  onSwitchProvider: () => void
} & Pick<InitialState, 'walletInfo' | 'isConnected' | 'type'>

export const WalletConnected = (props: WalletConnectedProps) => {
  return (
    <MemoryRouter initialEntries={entries}>
      <Switch>
        <Route path='/'>
          <WalletConnectedMenu
            isConnected={props.isConnected}
            walletInfo={props.walletInfo}
            onDisconnect={props.onDisconnect}
            onSwitchProvider={props.onSwitchProvider}
            type={props.type}
          />
        </Route>
      </Switch>
    </MemoryRouter>
  )
}

type WalletButtonProps = {
  isConnected: boolean
  isLoadingLocalWallet: boolean
  onConnect: () => void
} & Pick<InitialState, 'walletInfo'>

const WalletButton: FC<WalletButtonProps> = ({
  isConnected,
  walletInfo,
  onConnect,
  isLoadingLocalWallet,
}) => {
  const [walletLabel, setWalletLabel] = useState('')
  const [shouldShorten, setShouldShorten] = useState(true)
  const bgColor = useColorModeValue('gray.300', 'gray.800')

  useEffect(() => {
    ;(async () => {
      setShouldShorten(true)
      if (!walletInfo || !walletInfo.meta) return setWalletLabel('')
      if (walletInfo.meta.address) {
        try {
          const addressReverseLookup = await ensReverseLookup(walletInfo.meta.address)
          if (!addressReverseLookup.error) {
            setShouldShorten(false)
            return setWalletLabel(addressReverseLookup.name)
          }
          return setWalletLabel(walletInfo?.meta?.address ?? '')
        } catch (_) {
          return setWalletLabel(walletInfo?.meta?.address ?? '')
        }
      }
      if (walletInfo.meta.label) {
        setShouldShorten(false)
        return setWalletLabel(walletInfo.meta.label)
      }
    })()
  }, [walletInfo])

  return Boolean(walletInfo?.deviceId) || isLoadingLocalWallet ? (
    <MenuButton
      as={Button}
      width={{ base: '100%', lg: 'auto' }}
      isLoading={isLoadingLocalWallet}
      leftIcon={
        <HStack>
          {!(isConnected || walletInfo?.deviceId === 'DemoWallet') && (
            <WarningTwoIcon ml={2} w={3} h={3} color='yellow.500' />
          )}
          <WalletImage walletInfo={walletInfo} />
        </HStack>
      }
      rightIcon={<ChevronDownIcon />}
    >
      <Flex>
        {walletLabel ? (
          <MiddleEllipsis
            rounded='lg'
            fontSize='sm'
            p='1'
            pl='2'
            pr='2'
            shouldShorten={shouldShorten}
            bgColor={bgColor}
            address={walletLabel}
          />
        ) : (
          <RawText>{walletInfo?.name}</RawText>
        )}
      </Flex>
    </MenuButton>
  ) : (
    <Button onClick={onConnect} leftIcon={<FaWallet />}>
      <Text translation='common.connectWallet' />
    </Button>
  )
}

export const UserMenu: React.FC<{ onClick?: () => void }> = ({ onClick }) => {
  const { state, dispatch, disconnect } = useWallet()
  const { pairedApps, appSettings } = useModal()
  const { isConnected, walletInfo, type } = state
  const hasWallet = Boolean(walletInfo?.deviceId)

  const handleConnect = () => {
    onClick && onClick()
    dispatch({ type: WalletActions.SET_WALLET_MODAL, payload: true })
  }

  const handleAppSettings = () => {
    console.info('OPEN APP SETTINGS')
    appSettings.open({})
  }

  return (
    <Menu>
      <WalletButton
        onConnect={handleConnect}
        walletInfo={walletInfo}
        isConnected={isConnected}
        isLoadingLocalWallet={state.isLoadingLocalWallet}
      />
      <MenuList
        maxWidth={{ base: 'full', md: 'xs' }}
        minWidth={{ base: 0, md: 'xs' }}
        overflow='hidden'
      >
        {hasWallet ? (
          <WalletConnected
            isConnected={isConnected || walletInfo?.deviceId === 'DemoWallet'}
            walletInfo={walletInfo}
            onDisconnect={disconnect}
            onSwitchProvider={handleConnect}
            type={type}
          />
        ) : (
          <NoWallet onClick={handleConnect} />
        )}
        <MenuItem icon={<SettingsIcon />} onClick={handleAppSettings}>
          <Text translation='common.appSettings' />
        </MenuItem>
        <MenuItem icon={<FaPuzzlePiece />} onClick={() => pairedApps.open({})}>
          <Text translation='common.pairedApps' />
        </MenuItem>
        <MenuItem
          icon={<ExternalLinkIcon />}
          as={Link}
          isExternal
          _hover={{ textDecoration: 'none', outline: 'none' }}
          href='http://localhost:1646/docs'
        >
          <Text translation='common.devTools' />
        </MenuItem>
      </MenuList>
    </Menu>
  )
}
