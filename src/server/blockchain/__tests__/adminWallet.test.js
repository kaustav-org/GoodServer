import AdminWallet from '../AdminWallet'
import txManager from '../../utils/tx-manager'
import Web3 from 'web3'

const web3 = new Web3()
const generateWalletAddress = () => web3.eth.accounts.create().address

jest.setTimeout(10000)
describe('adminwallet', () => {
  beforeAll(async () => {
    await AdminWallet.ready
  })

  test(`adminWallet top wallet shouldn't throws an error when user is not whitelisted/verified`, async () => {
    const unverifiedAddress = generateWalletAddress()
    const tx = await AdminWallet.topWallet(unverifiedAddress).catch(e => false)
    expect(tx).toBeTruthy()
  })

  test('adminWallet constructor works', async () => {
    expect(await AdminWallet.ready.catch(_ => false)).toBeTruthy()
  })

  test('adminWallet can whitelist user', async () => {
    await AdminWallet.removeWhitelisted('0x888185b656fe770677a91412f9f09B23A787242A').catch(_ => _)
    const tx = await AdminWallet.whitelistUser('0x888185b656fe770677a91412f9f09B23A787242A')
    const isVerified = await AdminWallet.isVerified('0x888185b656fe770677a91412f9f09B23A787242A')
    expect(isVerified).toBeTruthy()
  })

  test('adminWallet can blacklist user', async () => {
    const tx = await AdminWallet.removeWhitelisted('0x888185b656fe770677a91412f9f09B23A787242A')
    const isVerified = await AdminWallet.isVerified('0x888185b656fe770677a91412f9f09B23A787242A')
    expect(isVerified).not.toBeTruthy()
  })

  test('adminWallet throws exception', async () => {
    const unverifiedAddress = '0x888185b656fe770677a91412f9f09B23A787242A'
    expect(await AdminWallet.removeWhitelisted(unverifiedAddress).catch(e => false)).toBeFalsy()
  })

  test('adminWallet get balance correctly', async () => {
    const balance = await AdminWallet.getBalance()
    expect(balance > 0).toBeTruthy()
  })

  test('adminWallet receive queue nonce', async () => {
    const promises = []
    for (let i = 0; i < 5; i++) {
      const unverifiedAddress = generateWalletAddress()
      const tx = await AdminWallet.whitelistUser(unverifiedAddress)
      promises.push(AdminWallet.topWallet(unverifiedAddress))
    }
    const res = await Promise.all(promises).catch(_ => false)
    expect(res).toBeTruthy()
  })

  test('adminWallet bad transaction in queue', async () => {
    const unverifiedAddress = generateWalletAddress()
    const unverifiedAddress2 = generateWalletAddress()
    const from = AdminWallet.address
    const testValue = 10
    const badGas = 10
    let tx

    //good tx
    await AdminWallet.whitelistUser(unverifiedAddress)
    tx = await AdminWallet.topWallet(unverifiedAddress)
    expect(tx).toBeTruthy()

    //bad tx
    await expect(
      AdminWallet.sendNative({
        from,
        to: unverifiedAddress,
        value: testValue,
        gas: badGas,
        gasPrice: badGas
      })
    ).rejects.toThrow()

    //good tx
    await AdminWallet.whitelistUser(unverifiedAddress2)
    tx = await AdminWallet.topWallet(unverifiedAddress2)
    expect(tx).toBeTruthy()
  })

  test('queue Manager lock with one address', async () => {
    const unverifiedAddress = generateWalletAddress()
    const { release } = await txManager.lock(unverifiedAddress)
    await release()
  })

  test('queue Manager lock with array of addresses', async () => {
    const unverifiedAddresses = [generateWalletAddress(), generateWalletAddress()]
    const { release } = await txManager.lock(unverifiedAddresses)
    await release()
  })
})
