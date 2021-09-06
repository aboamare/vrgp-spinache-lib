import { Peer } from './peer.js';

import NMEASentences from './tests/NMEA-sentences.js';

export class VesselInterface extends Peer {
  constructor (properties = {}) {
    super()
    Object.assign(this, properties)
  }

  get mmsi () {
    return this._mmsi
  }

  set mmsi (newMMSI) {
    if (this.connection) {
      this.closeConnection()
    }
    this._mmsi = newMMSI
  }

  get lat () {
    return this.position ? this.position.latitude : null
  }

  get long () {
    return this.position ? this.position.longitude : null
  }

  contactMOC(mocHostOrUrl, guidance = 'recommendation') {
    if (!this.mmsi) {
      throw Error(`Can't contact MOC as MMSI is not set!`)
    }
    let mocUrl
    try {
      mocUrl = new URL(mocHostOrUrl)
    } catch (err) {
      mocUrl = new URL(`https://${mocHostOrUrl}/vessels/${this.mmsi}`)
    }
    this.register(mocUrl, 'vrgp-1.0', {
      capabilities, 
      guidance, 
      nmea: this.status.nmea
    })
  }

  processMessage(msgObj) {
    if (msgObj.request) {
      const request = msgObj.request
      if (request.iceServers) {
        this.iceServers = request.iceServers
      }
      this.handleRequest(request)
    }
    super.processMessage(msgObj)
  }

  handleRequest(requestObj) {
    if (requestObj.conning) 
      this.shareConning(requestObj.conning)
    else throw Error('Received invalid request')
  }

  shareConning(params = 'nmea') {
    const sendNMEAs = (sentences, delay=1) => {
      if (sentences.length < 1) {
        return;
      }
      const s = sentences.shift()
      const self = this
      setTimeout(() => {
        if (self.conning) {
          self.conning.send(s)
        }
        sendNMEAs(sentences)
      }, delay * 1000)
    }

    if (!this.connection) {
      this.createConnection()
    }
    this.conning = this.createDataChannel('conning:nmea', {
      ordered: false
    });
    this.conning.onopen = ev => {
      this.conning.send("moimoimoi!")
      sendNMEAs(NMEASentences.slice(0))
    }
  }

  statusReport(message) {
    const setTimer = (delay = 5000) => {
      return setTimeout(() => {
        if (this.ws) {
          this.sendMessage(this.status);
        }
        this.statusTimer = setTimer();
      }, delay); //TODO: the time between status reports should be dependent on the sog
    };
    if (message) this.status = message
    if (!this.status) {
      this.status = {nmea: NMEASentences.shift()}
    }
    if (!this.statusTimer) {
      this.statusTimer = setTimer(100)
    }
  }

  hangup() {
    this.closeConnection()
    if (this.conning) {
      delete this.conning
    }
    if (this.ws) {
      const ws = this.ws
      this.sendMessage({hangup: true})
      delete this.ws
      setTimeout(() => ws.close(), 500)
    }
  }

  onWsOpen(ws) {
    if (!this.statusTimer) {
      this.statusReport()
    }
    if (this.onconnected) this.onconnected()
  }

  onWsClose() {
    if (this.statusTimer) {
      clearTimeout(this.statusTimer)
      delete this.statusTimer;
    }
    if (this.disconnected) this.disconnected()
    if (this.ws) {
      delete this.ws
      window.alert("Lost connection to MOC!")
    }
  }
}