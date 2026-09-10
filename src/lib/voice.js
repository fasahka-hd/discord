import { wsSend } from './ws.js'
import { getState, setState } from './store.js'

const RTC_CONFIG = {
  iceServers: [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
    { urls: 'stun:global.stun.twilio.com:3478' },
  ],
}

function readLS(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v } catch { return d } }
function writeLS(k, v) { try { localStorage.setItem(k, String(v)) } catch {} }

class VoiceManager {
  pcs = new Map()        
  remote = new Map()     
  localStream = null     
  txStream = null        
  screenStream = null
  channelId = null
  muted = false
  deafened = false
  connectedAt = 0
  ctx = null
  gainNode = null
  analyser = null
  localLevel = 0
  speakLoop = null
  pttWasMuted = false
  onerror = null

  
  get inputVolume() { const v = Number(readLS('dsh_vol_in', '1')); return Number.isFinite(v) ? v : 1 }
  set inputVolume(v) { writeLS('dsh_vol_in', v); if (this.gainNode) this.gainNode.gain.value = v }
  get outputVolume() { const v = Number(readLS('dsh_vol_out', '1')); return Number.isFinite(v) ? v : 1 }
  set outputVolume(v) {
    writeLS('dsh_vol_out', v)
    for (const r of this.remote.values()) this.setRemoteGain(r, v)
  }
  get outputDevice() { return readLS('dsh_spk', '') }
  setOutputDevice(id) {
    writeLS('dsh_spk', id || '')
    try { this.ctx?.setSinkId?.(id) } catch {}
  }
  get voiceProfile() { return readLS('dsh_voice_profile', 'isolation') }
  set voiceProfile(v) { writeLS('dsh_voice_profile', v) }
  get ptt() { return readLS('dsh_ptt', '0') === '1' }
  set ptt(v) { writeLS('dsh_ptt', v ? '1' : '0'); this.pttListeners() }

  micConstraints() {
    const p = this.voiceProfile
    const c = p === 'studio'
      ? { echoCancellation: false, noiseSuppression: true, autoGainControl: false }
      : p === 'custom'
        ? { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
        : { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    const mic = readLS('dsh_mic', '')
    if (mic) c.deviceId = { ideal: mic }
    return c
  }

  
  async join(channelId) {
    if (this.channelId === channelId) return true
    try {
      if (!this.localStream) {
        this.localStream = await navigator.mediaDevices.getUserMedia({ audio: this.micConstraints() })
        this.localStream.getAudioTracks().forEach(t => (t.enabled = !this.muted))
      }
    } catch (e) {
      
      this.muted = true
      this.localStream = null
      this.onerror && this.onerror('Нет доступа к микрофону — вы в режиме «только прослушивание».')
    }
    if (this.localStream && !this.txStream) this.buildTxGraph()
    this.channelId = channelId
    this.connectedAt = Date.now()
    this.ensureCtx()
    this.pushLocal()
    wsSend('voice:join', { channel_id: channelId })
    
    wsSend('voice:mute', { muted: this.muted, deafened: this.deafened })
    return true
  }

  leave() {
    wsSend('voice:leave')
    this.destroy()
  }

  
  buildTxGraph() {
    if (!this.ctx) return
    try {
      try { this.gainNode?.disconnect(); this.analyser?.disconnect() } catch {}
      const src = this.ctx.createMediaStreamSource(this.localStream)
      this.gainNode = this.ctx.createGain()
      this.gainNode.gain.value = this.inputVolume
      this.analyser = this.ctx.createAnalyser()
      this.analyser.fftSize = 512
      const dest = this.ctx.createMediaStreamDestination()
      src.connect(this.gainNode)
      this.gainNode.connect(this.analyser)   
      this.gainNode.connect(dest)            
      this.txStream = dest.stream
    } catch {
      this.txStream = this.localStream       
    }
  }

  ensureCtx() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext
      this.ctx = new AC()
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {})
    const spk = readLS('dsh_spk', '')
    if (spk) { try { this.ctx.setSinkId?.(spk) } catch {} }
    if (this.localStream && (!this.txStream || this.txStream === this.localStream)) this.buildTxGraph()
    if (!this.speakLoop) this.speakLoop = setInterval(() => this.detectSpeaking(), 150)
  }

  
  onInit({ channel_id, peers }) {
    if (!channel_id) { this.destroy(); return }
    this.channelId = channel_id
    for (const uid of [...this.pcs.keys()]) {
      if (!peers.includes(uid)) this.removePeer(uid)
    }
    for (const p of peers) if (!this.pcs.has(p)) this.createPC(p)
  }

  prune(channelId, userIds) {
    if (channelId !== this.channelId) return
    for (const uid of [...this.pcs.keys()]) {
      if (!userIds.includes(uid) && uid !== getState().me?.id) this.removePeer(uid)
    }
  }

  createPC(peerId) {
    const pc = new RTCPeerConnection(RTC_CONFIG)
    this.pcs.set(peerId, pc)
    if (this.txStream) for (const track of this.txStream.getAudioTracks()) pc.addTrack(track, this.txStream)
    else pc.addTransceiver('audio', { direction: 'recvonly' }) 
    pc.onicecandidate = e => { if (e.candidate) wsSend('voice:signal', { to: peerId, data: { ice: e.candidate.toJSON ? e.candidate.toJSON() : e.candidate } }) }
    pc.ontrack = e => this.attachRemote(peerId, e.streams[0])
    pc.onconnectionstatechange = () => {
      if (['failed', 'closed', 'disconnected'].includes(pc.connectionState)) {
        setTimeout(() => { if (pc.connectionState === 'disconnected') { pc.close(); this.removePeer(peerId) } }, 3000)
      }
    }
    
    pc.onnegotiationneeded = async () => {
      try {
        await pc.setLocalDescription(await pc.createOffer())
        wsSend('voice:signal', { to: peerId, data: { sdp: pc.localDescription } })
      } catch (e) { console.warn('negotiation error', e) }
    }
  }

  async onSignal({ from, data }) {
    if (from === getState().me?.id) return
    if (!this.channelId) return 
    let pc = this.pcs.get(from)
    if (!pc) { this.createPC(from); pc = this.pcs.get(from) }
    try {
      if (data.sdp) {
        if (data.sdp.type === 'offer') {
          
          if (pc.signalingState === 'have-local-offer') await pc.setLocalDescription({ type: 'rollback' })
          if (pc.signalingState === 'stable') await pc.setRemoteDescription(data.sdp)
          if (pc.signalingState === 'offer-received') {
            await pc.setLocalDescription(await pc.createAnswer())
            wsSend('voice:signal', { to: from, data: { sdp: pc.localDescription } })
          }
        } else if (pc.signalingState === 'have-local-offer') {
          await pc.setRemoteDescription(data.sdp)
        }
      } else if (data.ice) {
        await pc.addIceCandidate(data.ice).catch(() => {})
      }
    } catch (e) { console.warn('voice signal error', e) }
  }

  removePeer(uid) {
    const pc = this.pcs.get(uid)
    if (pc) { pc.close(); this.pcs.delete(uid) }
    this.detachRemote(uid)
  }

  setRemoteGain(r, v) {
    if (r.gain) r.gain.gain.value = v
    else if (r.el) r.el.volume = v
  }

  attachRemote(uid, stream) {
    this.detachRemote(uid)
    const entry = { stream, gain: null, el: null, analyser: null, data: null, level: 0 }
    if (this.ctx) {
      try {
        const src = this.ctx.createMediaStreamSource(stream)
        entry.analyser = this.ctx.createAnalyser()
        entry.analyser.fftSize = 512
        entry.gain = this.ctx.createGain()
        entry.gain.gain.value = this.deafened ? 0 : this.outputVolume
        src.connect(entry.analyser)
        entry.analyser.connect(entry.gain)
        entry.gain.connect(this.ctx.destination)
        entry.data = new Uint8Array(entry.analyser.frequencyBinCount)
      } catch { entry.gain = null; entry.analyser = null }
    }
    if (!entry.gain) {
      
      const el = document.createElement('audio')
      el.autoplay = true
      el.srcObject = stream
      el.volume = this.outputVolume
      el.muted = this.deafened
      document.body.appendChild(el)
      el.play().catch(() => {})
      entry.el = el
    }
    this.remote.set(uid, entry)
    
    if (stream.getVideoTracks().length > 0) setState({ screenShare: { userId: uid, stream, mine: false } })
  }

  detachRemote(uid) {
    const r = this.remote.get(uid)
    if (r) {
      try { r.gain?.disconnect(); r.analyser?.disconnect() } catch {}
      if (r.el) { r.el.pause(); r.el.remove() }
      this.remote.delete(uid)
      const ss = getState().screenShare
      if (ss && !ss.mine && ss.userId === uid) setState({ screenShare: null })
    }
  }

  


  detectSpeaking() {
    const me = getState().me?.id
    const now = {}
    const t = Date.now()
    const HANG = 450
    const TH = 0.05
    if (me && this.analyser) {
      const data = this._localData || (this._localData = new Uint8Array(this.analyser.frequencyBinCount))
      this.analyser.getByteFrequencyData(data)
      let sum = 0
      for (let i = 0; i < data.length; i++) sum += data[i] * data[i]
      const rms = Math.sqrt(sum / data.length) / 255
      if (rms > TH) this._lastLocalSpeak = t
      now[me] = t - (this._lastLocalSpeak || 0) < HANG
    }
    for (const [uid, a] of this.remote.entries()) {
      if (!a.analyser) continue
      a.analyser.getByteFrequencyData(a.data)
      let sum = 0
      for (let i = 0; i < a.data.length; i++) sum += a.data[i] * a.data[i]
      const rms = Math.sqrt(sum / a.data.length) / 255
      if (rms > TH) a.lastSpeak = t
      now[uid] = t - (a.lastSpeak || 0) < HANG
    }
    const prev = getState().speaking
    if (JSON.stringify(prev) !== JSON.stringify(now)) setState({ speaking: now })
  }

  

  setMuted(muted) {
    if (muted) {
      this.muted = true
    } else {
      if (this.deafened) this.deafened = false
      this.muted = false
    }
    this.applyAudioState()
  }
  setDeafened(deafened) {
    if (deafened === this.deafened) return
    if (deafened) {
      this._preDeafMuted = this.muted
      this.deafened = true
      this.muted = true
    } else {
      this.deafened = false
      this.muted = this._preDeafMuted || false
    }
    this.applyAudioState()
  }
  applyAudioState() {
    if (this.localStream) this.localStream.getAudioTracks().forEach(t => (t.enabled = !this.muted))
    for (const r of this.remote.values()) {
      if (r.gain) r.gain.gain.value = this.deafened ? 0 : this.outputVolume
      else if (r.el) r.el.muted = this.deafened
    }
    wsSend('voice:mute', { muted: this.muted, deafened: this.deafened })
    this.pushLocal()
  }
  pushLocal() {
    setState({ voiceLocal: { muted: this.muted, deafened: this.deafened } })
  }

  
  pttListeners() {
    document.removeEventListener('keydown', this._pttDown)
    document.removeEventListener('keyup', this._pttUp)
    if (this.ptt) {
      document.addEventListener('keydown', this._pttDown)
      document.addEventListener('keyup', this._pttUp)
    }
  }
  _pttDown = e => {
    if (!this.ptt || !this.channelId || e.repeat || e.ctrlKey || e.metaKey) return
    if (e.key.toLowerCase() !== 'v') return
    const t = document.activeElement
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return
    if (this.muted && !this.deafened) { this.pttWasMuted = true; this.setMuted(false) }
  }
  _pttUp = e => {
    if (!this.ptt || !this.channelId || e.key.toLowerCase() !== 'v') return
    if (this.pttWasMuted) { this.pttWasMuted = false; this.setMuted(true) }
  }

  
  async shareScreen() {
    if (this.screenStream) return true
    try {
      this.screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true })
    } catch {
      this.onerror && this.onerror('Демонстрация отменена')
      return false
    }
    const track = this.screenStream.getVideoTracks()[0]
    if (track) track.addEventListener('ended', () => this.stopScreenShare())
    for (const pc of this.pcs.values()) {
      if (track) { try { pc.addTrack(track, this.screenStream) } catch {} }
    }
    setState({ screenShare: { userId: getState().me?.id, stream: this.screenStream, mine: true } })
    return true
  }
  stopScreenShare() {
    const s = this.screenStream
    if (!s) return
    const track = s.getVideoTracks()[0]
    if (track) {
      for (const pc of this.pcs.values()) {
        try {
          const sender = pc.getSenders().find(x => x.track === track)
          if (sender) pc.removeTrack(sender)
        } catch {}
      }
    }
    s.getTracks().forEach(t => t.stop())
    this.screenStream = null
    setState({ screenShare: null })
  }

  destroy() {
    this.stopScreenShare()
    for (const uid of [...this.pcs.keys()]) this.removePeer(uid)
    if (this.localStream) { this.localStream.getTracks().forEach(t => t.stop()); this.localStream = null; this.txStream = null }
    if (this.ctx) { this.ctx.close().catch(() => {}); this.ctx = null }
    if (this.speakLoop) { clearInterval(this.speakLoop); this.speakLoop = null }
    this.analyser = null
    this.gainNode = null
    this.channelId = null
    this.muted = false
    this.deafened = false
    this._preDeafMuted = false
    this.pushLocal()
    setState({ speaking: {} })
  }
}

export const voice = new VoiceManager()
