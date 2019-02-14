// @flow
import express, { Router } from 'express'
import Gun from 'gun'
import SEA from 'gun/sea'
import { type StorageAPI, type UserRecord } from '../../imports/types'
import conf from '../server.config'
import logger from '../../imports/pino-logger'
import { stringify } from 'querystring';

const log = logger.child({ from: 'GunDB-Middleware' })

type ACK = {
  ok: string,
  err: string
}
Gun.chain.putAck = function(data, cb) {
  var gun = this,
    cb =
      cb ||
      function(ctx) {
        return ctx
      }
  let promise = new Promise((res, rej) => gun.put(data, ack => (ack.err ? rej(ack) : res(ack))))
  return promise.then(cb)
}

const setup = (app: Router) => {
  app.use(Gun.serve)
  global.Gun = Gun // / make global to `node --inspect` - debug only
  log.info('Done setup GunDB middleware.')
}
class GunDB implements StorageAPI {
  gun: Gun

  user: Gun

  usersCol: Gun

  serverName: string

  init(server: typeof express | null, password: string, name: string): Promise<boolean> {
    // this.gun = Gun()
    this.gun = Gun({ web: server, file: name })
    this.user = this.gun.user()
    this.serverName = name
    return new Promise((resolv, reject) => {
      this.user.create('gooddollar', password, createres => {
        log.info('Created gundb GoodDollar User', { name })
        this.user.auth('gooddollar', password, async authres => {
          log.info('Authenticated GunDB user:', { name })
          this.usersCol = this.user.get('users')
          resolv(true)
        })
      })
    })
  }

  async getUser(pubkey: string): Promise<UserRecord> {
    return this.usersCol.get(pubkey).then(u => {
      // eslint-disable-next-line no-param-reassign
      if (u) delete u._
      return u
    })
  }

  async addUser(user: UserRecord): Promise<boolean> {
    return this.updateUser(user)
  }

  async updateUser(user: UserRecord): Promise<boolean> {
    const { pubkey } = user
    const isDup = await this.isDupUserData(user)

    let promises = []
    if (!isDup) {
      promises.push(this.usersCol.get(pubkey).putAck(user))

      if (user.email) {
        const { email } = user
        promises.push(this.usersCol.get('byemail').putAck({ [email]: pubkey }))
      }

      if (user.mobile) {
        const { mobile } = user
        promises.push(this.usersCol.get('bymobile').put({ [mobile]: pubkey }))
      }

      return Promise.all(promises).then(r => true)
    }

    return Promise.reject(new Error('Duplicate user information (phone/email)'))
    // this.user.get('users').get(pubkey).secret({...user, jwt})
  }

  async isDupUserData(user: UserRecord) {
    if (user.email) {
      const res = await this.usersCol
        .get('byemail')
        .get(user.email)
        .then()
      if (res && res !== user.pubkey) return true
    }

    if (user.mobile) {
      const res = await this.usersCol
        .get('bymobile')
        .get(user.mobile)
        .then()
      if (res && res !== user.pubkey) return true
    }

    return false
  }

  async deleteUser(user: UserRecord): Promise<boolean> {
    const { pubkey } = user
    const userRecord = await this.usersCol.get(pubkey).then()
    log.info('deleteUser fetched record:', { userRecord })
    if (userRecord.email) {
      this.usersCol
        .get('byemail')
        .get(userRecord.email)
        .put(null)
    }

    if (userRecord.mobile) {
      this.usersCol
        .get('bymobile')
        .get(userRecord.mobile)
        .put(null)
    }

    this.usersCol.get(pubkey).put(null)
    return true
  }

  async storeOTP(user: UserRecord, otp: number): Promise<boolean> {
    const { pubkey } = user
    const expirationDate = Date.now() + conf.otpTtlMinutes * 60 * 1000
    this.usersCol.get('otpVerification').put({ [pubkey]: { otp, expirationDate } })
    return true
  }

  async getOTP(user: UserRecord): Promise<{ otp: string, expirationDate: number }> {
    const { pubkey } = user
    const storedOTP: {otp: string, expirationDate: number } = await this.usersCol.get('otpVerification').get(pubkey).then()
    return storedOTP
  }

  async deleteOTP(user: UserRecord): Promise<boolean> {
    const { pubkey } = user
    const userOTPRecord = await this.usersCol.get(pubkey).then()
    log.info('deleteOTP fetched record:', { userOTPRecord })
    this.usersCol.get('otpVerification').get(pubkey).put(null)
    return true
  }
}

const GunDBPublic = new GunDB()
const GunDBPrivate = new GunDB()

GunDBPrivate.init(null, conf.gundbPassword, 'privatedb')

export { setup, GunDBPublic, GunDBPrivate, GunDB }
