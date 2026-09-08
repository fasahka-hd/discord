// Minimal observable store + React binding.
let state = {
  ready: false,
  me: null,
  users: {},
  friends: [],
  incoming: [],
  outgoing: [],
  dms: [],
  guilds: [],
  reads: {},
  settings: null,
  blocks: [],
  voice: {},
  voiceLocal: { muted: false, deafened: false },
  presences: {},
  messages: {},
  typing: {},
  speaking: {},
  screenShare: null,
  incomingCall: null,
  restriction: null,
  ui: {
    guildId: '@home', channelId: null, friendsTab: 'online', settingsTab: 'profile',
    showMembers: true, modal: null, contextMenu: null, replyTo: null, lightbox: null,
    search: null, theme: (typeof localStorage !== 'undefined' && localStorage.getItem('dsh_theme')) || 'dark',
  },
}
const listeners = new Set()
export function getState() { return state }
export function setState(patch) { state = { ...state, ...patch }; for (const l of listeners) l() }
export function setUI(patch) { setState({ ui: { ...state.ui, ...patch } }) }
export function subscribe(l) { listeners.add(l); return () => listeners.delete(l) }
export function currentGuild() { const id=state.ui.guildId; return id==='@home'?null:state.guilds.find(g=>g.id===id)||null }
export function dmById(id) { return state.dms.find(c=>c.id===id) }
export function channelById(id) { if(!id)return null;const dm=state.dms.find(c=>c.id===id);if(dm)return dm;for(const g of state.guilds){const c=g.channels.find(c=>c.id===id);if(c)return {...c,_guild:g}}return null }
export function dmOtherUser(ch) { if(!ch)return null;const ids=ch.recipients||[];const other=ids.find(id=>id!==state.me?.id)||ids[0];return state.users[other]||null }
export function presenceOf(id) { return state.presences[id] || 'offline' }
export function isFriend(id) { return state.friends.some(f=>f.id===id) }
export function isBlocked(id) { return state.blocks.some(u=>u.id===id || u.blocked_user_id===id) }
export function myVoiceChannel() { const me=state.me?.id;for(const [ch,states] of Object.entries(state.voice))if(states.some(s=>s.user_id===me))return ch;return null }
export function myVoiceState() { const ch=myVoiceChannel();if(!ch)return null;return {channel_id:ch,...(state.voice[ch].find(s=>s.user_id===state.me.id)||{})} }
export function mergeUsers(users) { const map={...state.users};for(const u of users)if(u)map[u.id]={...map[u.id],...u};setState({users:map}) }
export function upsertMessage(msg) { const chId=msg.channel_id;const cur=state.messages[chId]||{list:[],has_more:false,loaded:false};if(cur.list.some(m=>m.id===msg.id))return;const list=[...cur.list,msg].sort((a,b)=>a.created_at-b.created_at);setState({messages:{...state.messages,[chId]:{...cur,list}}}) }
export function patchMessage(msg) { for(const [chId,data] of Object.entries(state.messages)){const idx=data.list.findIndex(m=>m.id===msg.id);if(idx>=0){const list=[...data.list];list[idx]={...list[idx],...msg};setState({messages:{...state.messages,[chId]:{...data,list}}});return}} }
export function removeMessage(id) { const msgs={...state.messages};for(const [chId,data] of Object.entries(msgs))if(data.list.some(m=>m.id===id))msgs[chId]={...data,list:data.list.filter(m=>m.id!==id)};setState({messages:msgs}) }
export function setMessages(chId,list,hasMore) { setState({messages:{...state.messages,[chId]:{list,has_more:hasMore,loaded:true}}}) }
export function prependMessages(chId,list,hasMore) { const cur=state.messages[chId]||{list:[],loaded:true};setState({messages:{...state.messages,[chId]:{list:[...list,...cur.list],has_more:hasMore,loaded:true}}}) }
export function upsertGuild(g) { const idx=state.guilds.findIndex(x=>x.id===g.id);setState({guilds:idx>=0?state.guilds.map((x,i)=>i===idx?g:x):[...state.guilds,g]}) }
export function ensureDMChannel(channel) { if(state.dms.some(c=>c.id===channel.id))return;setState({dms:[{...channel,last_message:null,unread:0},...state.dms]}) }
export function displayName(u) { return u?.display_name||u?.username||'???' }
