import {
  Alert,
  AlertDescription,
  AlertIcon,
  Button,
  Input,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalHeader,
  ModalOverlay
} from '@chakra-ui/react'
import { ipcRenderer } from 'electron'
import React, { useRef, useState } from 'react'
import { Text } from 'components/Text'
import { useModal } from 'context/ModalProvider/ModalProvider'

export const SignModal = (input: any) => {
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const { sign } = useModal()
  const { close, isOpen } = sign

  const inputRef = useRef<HTMLInputElement | null>(null)
  const invocationId = input.invocationId
  const unsignedTx = input
  const HDwalletPayload = input.HDwalletPayload

  const handleSubmit = async () => {
    setLoading(true)
    try {
      console.log('Approve sign! ', unsignedTx)
      if (unsignedTx) {
        //hook?
        //broadcast
        // let broadcastResult = await pioneer.App.broadcast(unsignedTx.network, signedTx)
        // console.log('broadcastResult: ', broadcastResult)
      }
    } catch (e) {
      setError('modals.connect.error')
    }
    setLoading(false)
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        ipcRenderer.send('unlockWindow', {})
        close()
      }}
      isCentered
      closeOnOverlayClick={false}
      closeOnEsc={false}
    >
      <ModalOverlay />
      <ModalContent justifyContent='center' px={3} pt={3} pb={6}>
        <ModalCloseButton ml='auto' borderRadius='full' position='static' />
        <ModalHeader>
          <Text translation={'modals.sign.header'} />
        </ModalHeader>
        <ModalBody>
          <div>invocation: {invocationId}</div>
          {/*<div>unsignedTx: {JSON.stringify(unsignedTx)}</div>*/}
          <div>HDwalletPayload: {JSON.stringify(HDwalletPayload)}</div>
          <Text color='gray.500' translation={'modals.sign.body'} />
          <Input
            ref={inputRef}
            size='lg'
            variant='filled'
            mt={3}
            mb={6}
            autoComplete='current-password'
          />
          {error && (
            <Alert status='error'>
              <AlertIcon />
              <AlertDescription>
                <Text translation={error} />
              </AlertDescription>
            </Alert>
          )}
          <Button
            isFullWidth
            size='lg'
            colorScheme='blue'
            onClick={handleSubmit}
            disabled={loading}
          >
            <Text translation={'modals.sign.sign'} />
          </Button>
        </ModalBody>
      </ModalContent>
    </Modal>
  )
}
