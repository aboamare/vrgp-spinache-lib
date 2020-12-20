/* eslint-disable comma-dangle */
export class Peer {
  constructor () {
    this.streams = [];
  }

  register(url, protocol, msgObj) {
    if (this.ws) {
      ws.close();
    }
    if (this.connection) {
      this.closeConnection();
    }
    const wsProtocol = window.location.protocol === 'http:' ? 'ws' : 'wss';    
    const ws = new WebSocket(`${wsProtocol}:${url}`, protocol);
    ws.onerror = (ev) => console.warn(ev);
    ws.onopen = () => {
      this.ws = ws;
      if (msgObj) {
        this.sendMessage(msgObj);
      }
      if (this.onWsOpen) {
        this.onWsOpen(ws);
      }
    };
    ws.onclose = () => {
      if (this.onWsClose) {
        this.onWsClose(ws);
      }
      if (this.ws) delete this.ws;
      this.closeConnection();
    };
    ws.onmessage = (ev) => {
      let receivedMsg;
      try {
        receivedMsg = JSON.parse(ev.data);
      } catch (jsonError) {
        receivedMsg = {error: "Received invalid message", data: msgData}
      }
      this.processMessage(receivedMsg);
    };
  }

  sendMessage(msgObj) {
    if (!this.ws) {
      throw Error('Cannot send message, no socket');
    }
    this.ws.send(JSON.stringify(msgObj));
  }

  createConnection() {
    if (!this.connection) {
      let connectionConfig = {
        iceTransportPolicy: 'all',
        iceCandidatePoolSize: '0',
      };
      if (this.iceServers) {
        connectionConfig.iceServers = this.iceServers;
      }
      let connection = new RTCPeerConnection(connectionConfig);
      connection.ondatachannel = event => {
        let channel = event.channel;
        this.streams.push(channel);
        let processors = [
          // (msgData) => {
          //  console.debug(`${this.id}: ${msgData}`);
          // }
        ];
        if (this.ondatachannel) {
          let additionalProcessors = this.ondatachannel(channel);
          if (Array.isArray(additionalProcessors)) {
            processors.push(...additionalProcessors);
          }
        }
        channel.onmessage = (msgEvent) => {
          processors.forEach(proc => proc(msgEvent.data));
        }
      };
      connection.onicecandidate = event => {
        // console.log(event.candidate);
        this.sendMessage({ice: event.candidate});
      }
      connection.oniceconnectionstatechange = event => {
        console.log(`ICE state is now: ${connection.iceConnectionState}`);
        if (connection.iceConnectionState === 'connected' && this.onconnected) {
          this.onconnected('iceConnected');
        }
      }
      connection.onsignalingstatechange = event => {
        console.log(`Signal state is now: ${connection.signalingState}`);
        if (connection.signalingState === 'closed' && this.connection) {
          delete this.connection;
        }
      }
      connection.onconnectionstatechange = event => {
        console.log(`Connection state is now: ${connection.connectionState}`);
        if (this.connection && ['closed', 'failed', 'disconnected'].includes(connection.connectionState)) {
          delete this.connection;
        }
      }
      connection.ontrack = (ev) => {
        const stream = ev.streams[0];
        this.streams.push(stream);
        if (this.onstream) {
          this.onstream(stream);
        }
      };
      connection.onnegotiationneeded = async () => {
        let offer = await connection.createOffer();
        await connection.setLocalDescription(offer);
        this.sendMessage({sdp: connection.localDescription})
      };
      this.connection = connection;
    }
  }

  closeConnection () {
    if (this.connection) {
      const connection = this.connection;
      connection.ontrack = null;
      connection.onremovetrack = null;
      connection.onremovestream = null;
      connection.onicecandidate = null;
      connection.oniceconnectionstatechange = null;
      connection.onsignalingstatechange = null;
      connection.onicegatheringstatechange = null;
      connection.onnegotiationneeded = null;
      let streams = this.streams;
      while (streams.length) {
        let stream = streams.pop();
        if (stream.stop) stream.stop();
        if (stream.close) stream.close();
      }
      connection.close();
      delete this.connection;
    }
  }

  bye() {
    this.sendMessage({bye: true});
    this.closeConnection();
  }
  
  createDataChannel(label, properties) {
    let channel = this.connection.createDataChannel(label, properties);
    if (!this.streams) {
      this.streams = [];
    }
    this.streams.push(channel);
    return channel;
  }

  processMessage (msgObj) {
    console.log(msgObj)
    if (msgObj.iceServers) {
      this.iceServers = msgObj.iceServers;
    }
    if (msgObj.ice) {
      let candidate = new RTCIceCandidate(msgObj.ice);
      this.connection.addIceCandidate(candidate)
      .then(() => {
        console.log('Remote candidate added');
        console.log(candidate);
      })
      .catch(err => {
        console.log('Remote candidate ignored');
      });
    }
    if (msgObj.sdp) {
      const sp = new RTCSessionDescription(msgObj.sdp);
      const connection = this.connection;
      if (sp.type === 'offer') {
        connection.setRemoteDescription(sp)
        .then(() => connection.createAnswer())
        .then(answer => connection.setLocalDescription(answer))
        .then(() => this.sendMessage({sdp: connection.localDescription}));
      } else {
        connection.setRemoteDescription(sp);        
      }
    }
    if (msgObj.hangup) {
      if (this.onHangup) {
        this.onHangup(msgObj.hangup);
      }
      if (this.connection) this.closeConnection();
    }
    if (this.onmessage) {
      this.onmessage(msgObj);
    }
  }

}
