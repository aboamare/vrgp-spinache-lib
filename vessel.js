import {Peer} from './peer.js';

import NMEASentences from './tests/NMEA-sentences.js';

class VesselInterface extends Peer {
  constructor (handlers) {
    super();
    Object.assign(this, handlers);
    this.status = {nmea: NMEASentences.shift()};
  }

  setMMSI (mmsi) {
    if (this.connection) {
      this.closeConnection();
    }
    this.mmsi = mmsi;
  }

  contactMOC(moc = window.location.host, capabilities = {conning: {formats: ['nmea']}}, guidance = 'recommendation') {
    if (!this.mmsi) {
      throw Error(`Can't contact MOC as MMSI is not set!`);
    }
    let mocURL = `/${moc}/vessels/${this.mmsi}`;
    this.register(mocURL, 'marvi-1.0', {capabilities, guidance, nmea: this.status.nmea});
  }

  processMessage(msgObj) {
    if (msgObj.request) {
      const request = msgObj.request;
      if (request.iceServers) {
        this.iceServers = request.iceServers;
      }
      this.handleRequest(request);
    }
    super.processMessage(msgObj);
  }

  handleRequest(requestObj) {
    if (requestObj.conning) 
      this.shareConning(requestObj.conning)
    else throw Error('Received invalid request');
  }

  shareConning(params = 'nmea') {
    const sendNMEAs = (sentences, delay=1) => {
      if (sentences.length < 1) {
        return;
      }
      const s = sentences.shift();
      const self = this;
      setTimeout(() => {
        if (self.conning) {
          self.conning.send(s);
        }
        sendNMEAs(sentences);
      }, delay * 1000);
    }

    if (!this.connection) {
      this.createConnection()
    }
    this.conning = this.createDataChannel('conning:nmea', {
      ordered: false
    });
    this.conning.onopen = ev => {
      this.conning.send("moimoimoi!");
      sendNMEAs(NMEASentences.slice(0));
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
    if (message) this.status = message;
    if (!this.status) {
      this.status = {nmea: NMEASentences.shift()};
    }
    if (!this.statusTimer) {
      this.statusTimer = setTimer(100);
    }
  }

  hangup() {
    this.closeConnection();
    if (this.conning) {
      delete this.conning;
    }
    if (this.ws) {
      const ws = this.ws;
      this.sendMessage({hangup: true});
      delete this.ws;
      setTimeout(() => ws.close(), 500);
    }
  }

  onWsOpen(ws) {
    if (!this.statusTimer) {
      this.statusReport();
    }
    if (this.onconnected) this.onconnected();
  }

  onWsClose() {
    if (this.statusTimer) {
      clearTimeout(this.statusTimer);
      delete this.statusTimer;
    }
    if (this.disconnected) this.disconnected();
    if (this.ws) {
      delete this.ws;
      window.alert("Lost connection to MOC!");
    }
  }
}

export {VesselInterface};