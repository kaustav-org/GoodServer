// @flow
import Web3 from 'web3'
import { default as PromiEvent } from 'web3-core-promievent'
import HDWalletProvider from 'truffle-hdwallet-provider'
import IdentityABI from '@gooddollar/goodcontracts/build/contracts/Identity.json'
import RedemptionABI from '@gooddollar/goodcontracts/build/contracts/RedemptionFunctional.json'
import GoodDollarABI from '@gooddollar/goodcontracts/build/contracts/GoodDollar.json'
import ReserveABI from '@gooddollar/goodcontracts/build/contracts/GoodDollarReserve.json'
import conf from '../server.config'
import logger from '../../imports/pino-logger'
import { type TransactionReceipt } from './blockchain-types'
import moment from 'moment'

const log = logger.child({ from: 'AdminWallet' })
export class Wallet {
  web3: Web3

  wallet: HDWalletProvider

  accountsContract: Web3.eth.Contract

  tokenContract: Web3.eth.Contract

  identityContract: Web3.eth.Contract

  claimContract: Web3.eth.Contract

  reserveContract: Web3.eth.Contract

  address: string

  networkId: number

  constructor(mnemonic: string) {
    this.wallet = new HDWalletProvider(
      mnemonic,
      conf.ethereum.httpWeb3Provider
      // new Web3.providers.WebsocketProvider(conf.ethereum.websocketWeb3Provider)
    )
    this.web3 = new Web3(this.wallet)
    this.address = this.wallet.getAddress()
    this.web3.eth.defaultAccount = this.address
    this.networkId = conf.ethereum.network_id // ropsten network
    this.identityContract = new this.web3.eth.Contract(IdentityABI.abi, IdentityABI.networks[this.networkId].address, {
      from: this.address
    })
    this.claimContract = new this.web3.eth.Contract(RedemptionABI.abi, RedemptionABI.networks[this.networkId].address, {
      from: this.address
    })
    this.tokenContract = new this.web3.eth.Contract(GoodDollarABI.abi, GoodDollarABI.networks[this.networkId].address, {
      from: this.address
    })
    this.reserveContract = new this.web3.eth.Contract(ReserveABI.abi, ReserveABI.networks[this.networkId].address, {
      from: this.address
    })
  }

  async whitelistUser(address: string): Promise<TransactionReceipt> {
    const tx: TransactionReceipt = await this.identityContract.methods.whiteListUser(address).send()
    return tx
  }

  async blacklistUser(address: string): Promise<TransactionReceipt> {
    const tx: TransactionReceipt = await this.identityContract.methods.blackListUser(address).send()
    return tx
  }

  async isVerified(address: string): Promise<boolean> {
    const tx: boolean = await this.identityContract.methods.isVerified(address).call()
    return tx
  }

  async topWallet(address: string, lastTopping?:moment.Moment = moment().subtract(1,'day')): PromiEvent<TransactionReceipt> {
    let daysAgo = moment().diff(moment(lastTopping), 'days')
    if (daysAgo < 1) throw new Error('Daily limit reached')
    if (await this.isVerified(address)) {
      let userBalance = await this.web3.eth.getBalance(address)
      let toTop = parseInt(Web3.utils.toWei('1000000', 'gwei')) - userBalance
      log.debug('TopWallet:', { userBalance, toTop })
      if (toTop > 0) return this.web3.eth.sendTransaction({ to: address, value: toTop })
      throw new Error("User doesn't need topping")
    } else throw new Error('User not verified')
  }

  async getBalance(): Promise<number> {
    return this.web3.eth.getBalance(this.address).then(b => Web3.utils.fromWei(b))
  }
}

const AdminWallet = new Wallet(conf.mnemonic)
export default AdminWallet