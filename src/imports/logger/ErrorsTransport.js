import * as Sentry from '@sentry/node'
import { RewriteFrames } from '@sentry/integrations'
import Transport from 'winston-transport'
import { SPLAT } from 'triple-beam'
import { assign, forEach, bindAll, trimEnd } from 'lodash'

import Config from '../../server/server.config'

export default class ErrorsTransport extends Transport {
  sentryInitialized = false

  static factory = options => new ErrorsTransport(options, Config, Sentry)

  constructor(opts, Config, Sentry) {
    const { env, sentryDSN, version, network, remoteLoggingAllowed } = Config

    super(opts)
    bindAll(this, 'onLogged')

    if (!remoteLoggingAllowed || !sentryDSN) {
      return
    }

    Sentry.init({
      dsn: sentryDSN,
      environment: env,
      release: version,
      integrations: [new RewriteFrames()]
    })

    Sentry.configureScope(scope => {
      scope.setTag('appVersion', version)
      scope.setTag('networkUsed', network)
    })

    this.sentryInitialized = true
  }

  log(context, callback) {
    const { sentryInitialized, onLogged } = this

    if (!sentryInitialized) {
      onLogged(context, callback)
      return
    }

    const { message: generalMessage, userId, ...data } = context

    // context[SPLAT] could be undefined in case if just one argument passed to the error log
    // i.e log.error('some error message')
    const [errorMessage, errorObj = new Error(), extra = {}] = context[SPLAT] || []
    const dataToPassIntoLog = { generalMessage, errorMessage, errorObj, ...extra, ...data }
    const { message } = errorObj

    Sentry.configureScope(scope => {
      scope.setUser({
        userId
      })

      forEach(dataToPassIntoLog, (value, key) => {
        scope.setExtra(key, value)
      })
    })

    errorObj.message = `${trimEnd(generalMessage, ' :')}: ${message}`
    Sentry.captureException(errorObj)

    Sentry.flush().finally(() => {
      assign(errorObj, { message })
      onLogged(context, callback)
    })
  }

  onLogged(context, callback) {
    this.emit('logged', context)
    callback()
  }
}
