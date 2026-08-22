/* Tabora Social — friends, badges & chat (text/voice/photo/gif/sticker) */

const GIF_PACK = [
  'https://media.tenor.com/dXpgWvbJY7UAAAAM/panda-animated-pfp.gif',
  'https://media.tenor.com/LJ3JNWFzFYMAAAAM/cute-bunny-carrot-animated.gif',
  'https://media.tenor.com/zr4PqCPk16gAAAAM/panda-gifs.gif',
  'https://media.tenor.com/qdefn1P1x0gAAAAM/panda.gif',
  'https://media.tenor.com/-lprPfXcuPMAAAAM/mad-cool-cool.gif',
  'https://media.tenor.com/FCLXKjJv39oAAAAM/ethan76167-discord-profile-pictures.gif',
  'https://media.tenor.com/OMWtcAeuZN5n48g3TUh6xa6vIVXQ4HVQ-ytbP6kk1doAAAAM/hamster.gif',
  'https://media.tenor.com/01OoIP5woPUAAAAM/salam-hello.gif',
  'https://media.tenor.com/Ei3A4l8gCAtsvY15UF-_e56vj9fDoEGHyR0lfA3IgCwAAAAM/bunny-cute-animals.gif',
  'https://media.tenor.com/wbIL95YEXBH312Hm4wEPkNB3SaThe4pdhCqZyqJpqY8AAAAM/bunny-cute-animals.gif',
  'https://media.tenor.com/satp2TeMtZiH-nN5q5s4RKBQS9XwgmkN6EWckXblTkgAAAAM/dinosaur.gif',
  'https://media.tenor.com/5szJRCQ_YgkTckuHoihr9CoGReNhHGHXXdVolV6TIUsAAAAM/anime.gif'
];
const STICKERS = ['😀','😂','🤣','😍','🥰','😎','🤩','🥳','😇','🤗','🤔','😴','😭','😡','🤯','🫠','👍','👎','👏','🙏','💪','🤝','✌️','🤟','❤️','🧡','💛','💚','💙','💜','🖤','💯','🔥','✨','⭐','🎉','🎂','🌹','🌈','☕','🍕','⚽','🎮','🚀','👑','🛡️','🙈','💀','👻','🤖'];

const Social = {
  activeChat: null,
  pollTimer: 0,
  lastMsgId: 0,
  recorder: null, recChunks: [],

  badgeHTML(role) {
    if (role === 'owner') return '<span class="badge badge-owner" title="' + I18n.t('badge_owner') + '">👑 ' + I18n.t('badge_owner') + '</span>';
    if (role === 'admin') return '<span class="badge badge-admin" title="' + I18n.t('badge_admin') + '">🛡️ ' + I18n.t('badge_admin') + '</span>';
    return '';
  },
  avatarHTML(u, cls) {
    let src = '';
    if (u.avatar) {
      if (u.avatar.startsWith('bundle:')) src = 'assets/avatars/' + u.avatar.slice(7) + '.gif';
      else src = u.avatar;
    }
    if (!src) return `<span class="avatar ${cls || ''} avatar-fallback">${(u.name || u.username || '?')[0].toUpperCase()}</span>`;
    return `<img class="avatar ${cls || ''}" src="${src}" alt="">`;
  },

  /* ---------- friends list / search / requests ---------- */
  async renderFriendsPanel() {
    const box = document.getElementById('friends-body');
    if (!Store.state.token) { box.innerHTML = `<div class="need-auth">${I18n.t('auth_hint')}<br><br><button class="btn primary" onclick="Panels.openAuth('login')">${I18n.t('login')}</button> <button class="btn" onclick="Panels.openAuth('register')">${I18n.t('register')}</button></div>`; return; }
    box.innerHTML = `<div class="pr-loading">${I18n.t('loading')}</div>`;
    try {
      const d = await Api.friends();
      let html = '';
      if (d.incoming.length) {
        html += `<div class="sec-label">${I18n.t('requests')} (${d.incoming.length})</div>`;
        d.incoming.forEach(u => {
          html += `<div class="fr-row glass">
            ${this.avatarHTML(u)}
            <div class="fr-info"><b>${u.name}</b> <span class="muted">@${u.username}</span> ${this.badgeHTML(u.role)}</div>
            <div class="fr-actions">
              <button class="btn small primary" data-act="accept" data-id="${u.id}">${I18n.t('accept')}</button>
              <button class="btn small" data-act="decline" data-id="${u.id}">${I18n.t('decline')}</button>
            </div></div>`;
        });
      }
      html += `<div class="sec-label">${I18n.t('friends')}</div>`;
      if (!d.friends.length) html += `<div class="muted pad">${I18n.t('no_friends')}</div>`;
      d.friends.forEach(u => {
        html += `<div class="fr-row glass">
          ${this.avatarHTML(u)}
          <div class="fr-info"><b>${u.name}</b> <span class="muted">@${u.username}</span> ${this.badgeHTML(u.role)}</div>
          <div class="fr-actions">
            <button class="btn small primary" data-act="chat" data-id="${u.id}" data-name="${u.name}">${I18n.t('chat')} 💬</button>
            <button class="btn small danger" data-act="remove" data-id="${u.id}">✕</button>
          </div></div>`;
      });
      if (Store.state.user && Store.state.user.role === 'owner') {
        html += `<div class="sec-label">${I18n.t('owner_tools')}</div><div id="owner-tools" class="muted pad">…</div>`;
      }
      box.innerHTML = html;
      box.querySelectorAll('button[data-act]').forEach(b => {
        b.onclick = async () => {
          const act = b.dataset.act, id = b.dataset.id;
          try {
            if (act === 'accept') { await Api.friendAccept(id); showToast('✅'); }
            if (act === 'decline') { await Api.friendDecline(id); }
            if (act === 'remove') { await Api.friendRemove(id); }
            if (act === 'chat') { this.openChat(id, b.dataset.name); return; }
          } catch (e) { showToast(I18n.t('err_generic')); }
          this.renderFriendsPanel();
        };
      });
      if (Store.state.user && Store.state.user.role === 'owner') this.renderOwnerTools();
    } catch (e) { box.innerHTML = `<div class="muted pad">${I18n.t('err_generic')}</div>`; }
  },

  async renderOwnerTools() {
    const box = document.getElementById('owner-tools');
    if (!box) return;
    const d = await Api.friends();
    box.innerHTML = d.friends.map(u => `
      <div class="fr-row">
        ${this.avatarHTML(u)} <div class="fr-info"><b>${u.name}</b> ${this.badgeHTML(u.role)}</div>
        <button class="btn small" data-role="${u.role === 'admin' ? 'user' : 'admin'}" data-id="${u.id}">
          ${u.role === 'admin' ? I18n.t('remove_admin') : I18n.t('make_admin')}
        </button>
      </div>`).join('');
    box.querySelectorAll('button[data-role]').forEach(b => {
      b.onclick = async () => { await Api.setRole(b.dataset.id, b.dataset.role).catch(() => showToast(I18n.t('err_generic'))); this.renderOwnerTools(); };
    });
  },

  async searchUsers(q) {
    const res = document.getElementById('user-results');
    if (!q.trim()) { res.innerHTML = ''; return; }
    try {
      const d = await Api.users(q);
      res.innerHTML = d.users.length ? d.users.map(u => `
        <div class="fr-row glass">
          ${this.avatarHTML(u)}
          <div class="fr-info"><b>${u.name}</b> <span class="muted">@${u.username}</span> ${this.badgeHTML(u.role)}</div>
          <button class="btn small primary" data-un="${u.username}">${I18n.t('add_friend')}</button>
        </div>`).join('') : `<div class="muted pad">${I18n.t('no_results')}</div>`;
      res.querySelectorAll('button[data-un]').forEach(b => {
        b.onclick = async () => {
          try {
            const r = await Api.friendRequest(b.dataset.un);
            showToast(r.accepted ? '🤝 ' + I18n.t('accept') + '!' : '📨 ' + I18n.t('request_sent'));
            b.disabled = true;
          } catch (e) { showToast(I18n.t('err_' + e.code) || e.message); }
        };
      });
    } catch { res.innerHTML = ''; }
  },

  /* ---------- chat ---------- */
  openChat(userId, name) {
    this.activeChat = userId;
    this.lastMsgId = 0;
    document.getElementById('friends-view').style.display = 'none';
    const cv = document.getElementById('chat-view');
    cv.style.display = 'flex';
    document.getElementById('chat-title').textContent = name;
    document.getElementById('chat-msgs').innerHTML = '';
    this.poll(true);
    clearInterval(this.pollTimer);
    this.pollTimer = setInterval(() => this.poll(), 3000);
  },
  closeChat() {
    this.activeChat = null;
    clearInterval(this.pollTimer);
    document.getElementById('chat-view').style.display = 'none';
    document.getElementById('friends-view').style.display = 'block';
  },

  async poll(force) {
    if (!this.activeChat) return;
    try {
      const d = await Api.messages(this.activeChat, force ? 0 : this.lastMsgId);
      if (d.messages.length) {
        const box = document.getElementById('chat-msgs');
        d.messages.forEach(m => { box.appendChild(this.msgNode(m)); this.lastMsgId = Math.max(this.lastMsgId, m.id); });
        box.scrollTop = box.scrollHeight;
      }
    } catch { }
  },

  msgNode(m) {
    const mine = Store.state.user && m.sender === Store.state.user.id;
    const b = el('div', 'msg ' + (mine ? 'mine' : 'theirs'));
    let body = '';
    if (m.kind === 'text') body = `<div class="msg-text">${this.escapeHtml(m.content)}</div>`;
    else if (m.kind === 'image') body = `<img class="msg-img" src="${m.content}">`;
    else if (m.kind === 'gif') body = `<img class="msg-gif" src="${m.content}">`;
    else if (m.kind === 'voice') body = `<audio controls src="${m.content}" class="msg-voice"></audio>`;
    else if (m.kind === 'sticker') body = `<div class="msg-sticker">${m.content}</div>`;
    b.innerHTML = body + `<span class="msg-time">${new Date(m.created_at).toLocaleTimeString(I18n.lang === 'fa' ? 'fa-IR' : 'en-US', { hour: '2-digit', minute: '2-digit' })}</span>`;
    return b;
  },
  escapeHtml(s) { return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },

  async sendText() {
    const inp = document.getElementById('chat-input');
    const v = inp.value.trim();
    if (!v || !this.activeChat) return;
    inp.value = '';
    try { await Api.sendMessage(this.activeChat, 'text', v); this.poll(); }
    catch (e) { showToast(e.code === 'not_friends' ? I18n.t('not_friends_err') : I18n.t('err_generic')); }
  },

  async sendMedia(kind, dataUrl) {
    if (!this.activeChat) return;
    if (dataUrl.length > 1100000) { showToast('⚠️ ' + I18n.t('err_generic')); return; }
    try { await Api.sendMessage(this.activeChat, kind, dataUrl); this.poll(); }
    catch (e) { showToast(I18n.t('err_generic')); }
  },

  pickPhoto() {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*';
    inp.onchange = () => {
      const f = inp.files[0]; if (!f) return;
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        const sc = Math.min(1, 640 / Math.max(img.width, img.height));
        c.width = img.width * sc; c.height = img.height * sc;
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        this.sendMedia('image', c.toDataURL('image/jpeg', .72));
      };
      img.src = URL.createObjectURL(f);
    };
    inp.click();
  },

  openStickers() { this.toggleDrawer('sticker-drawer'); },
  openGifs() { this.toggleDrawer('gif-drawer'); },
  toggleDrawer(id) {
    ['sticker-drawer', 'gif-drawer'].forEach(d => { if (d !== id) document.getElementById(d).classList.remove('open'); });
    document.getElementById(id).classList.toggle('open');
  },
  renderDrawers() {
    const st = document.getElementById('sticker-grid');
    st.innerHTML = STICKERS.map(s => `<button class="sticker-btn">${s}</button>`).join('');
    st.querySelectorAll('button').forEach(b => b.onclick = () => { this.sendMedia('sticker', b.textContent); });
    const gf = document.getElementById('gif-grid');
    gf.innerHTML = GIF_PACK.map(u => `<img class="gif-thumb" src="${u}">`).join('') +
      `<div class="gif-url-row"><input id="gif-url-inp" data-i18n-ph="gif_url_placeholder" placeholder="${I18n.t('gif_url_placeholder')}"></div>`;
    gf.querySelectorAll('.gif-thumb').forEach(g => g.onclick = () => this.sendMedia('gif', g.src));
    gf.querySelector('#gif-url-inp').onkeydown = (e) => {
      if (e.key === 'Enter' && e.target.value.trim()) { this.sendMedia('gif', e.target.value.trim()); e.target.value = ''; }
    };
  },

  async toggleVoice() {
    const btn = document.getElementById('voice-btn');
    if (this.recorder && this.recorder.state === 'recording') {
      this.recorder.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.recChunks = [];
      this.recorder = new MediaRecorder(stream);
      this.recorder.ondataavailable = (e) => this.recChunks.push(e.data);
      this.recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        btn.classList.remove('recording');
        const blob = new Blob(this.recChunks, { type: this.recorder.mimeType || 'audio/webm' });
        const rd = new FileReader();
        rd.onload = () => this.sendMedia('voice', rd.result);
        rd.readAsDataURL(blob);
      };
      this.recorder.start();
      btn.classList.add('recording');
      showToast('🎙️ ' + I18n.t('recording'));
      setTimeout(() => { if (this.recorder && this.recorder.state === 'recording') this.recorder.stop(); }, 90000);
    } catch { showToast('🎙️ ⚠️'); }
  }
};
