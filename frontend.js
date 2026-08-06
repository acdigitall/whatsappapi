
    // ══════════════════════════════════════════════════════
    // ── STATE ────────────────────────────────────────────
    // ══════════════════════════════════════════════════════
    let state = {
      page: 'dashboard',
      custPage: 0, custSize: 50, custTotal: 0,
      filters: { kategori: '', ilce: '', durum: '', sort: 'oncelik', search: '' },
      stats: null,
      currentCustomer: null,
      templates: [],
      searchTimer: null
    };

    // ══════════════════════════════════════════════════════
    // ── NAVIGATION ───────────────────────────────────────
    // ══════════════════════════════════════════════════════
    const pageTitles = {
      dashboard: '📊 Dashboard',
      customers: '👥 Müşteriler',
      responded: '💬 Dönüş Yapanlar',
      messages: '📨 Mesaj Logları'
    };

    function navigate(page) {
      state.page = page;
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      document.querySelector('[data-page="' + page + '"]').classList.add('active');
      document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
      document.getElementById('page-' + page).classList.add('active');
      document.getElementById('page-title').textContent = pageTitles[page] || page;

      if (page === 'customers') loadCustomers();
      if (page === 'responded') loadResponded();
      if (page === 'messages') loadMessages();
    }

    // ══════════════════════════════════════════════════════
    // ── HELPERS ──────────────────────────────────────────
    // ══════════════════════════════════════════════════════
    function debounce(fn, ms) {
      return () => { clearTimeout(state.searchTimer); state.searchTimer = setTimeout(fn, ms); };
    }

    function animNum(id, target) {
      const el = document.getElementById(id);
      if (!el) return;
      const start = parseInt(el.textContent.replace(/\D/g, '')) || 0;
      const dur = 500, st = performance.now();
      function upd(t) {
        const p = Math.min((t - st) / dur, 1);
        const e = 1 - Math.pow(1 - p, 3);
        el.textContent = Math.round(start + (target - start) * e).toLocaleString('tr-TR');
        if (p < 1) requestAnimationFrame(upd);
      }
      requestAnimationFrame(upd);
    }

    function statusBadge(durum) {
      const m = {
        'yeni': '<span class="badge badge-new">Yeni</span>',
        'telefon_var': '<span class="badge badge-phone">📱 Telefon Var</span>',
        'telefon_yok': '<span class="badge badge-nophone">Telefon Yok</span>',
        'mesaj_gonderildi': '<span class="badge badge-sent">✉️ Gönderildi</span>',
        'numara_kayitsiz': '<span class="badge badge-unreg">⚠️ Kayıtsız</span>',
        'donus_yapti': '<span class="badge badge-responded">💬 Dönüş Yaptı</span>',
        'musteri_oldu': '<span class="badge badge-customer">🎉 Müşteri</span>',
        'ilgilenmiyor': '<span class="badge badge-notinterested">İlgilenmiyor</span>'
      };
      return m[durum] || '<span class="badge badge-new">' + (durum || 'Yeni') + '</span>';
    }

    function toast(msg, type = 'success') {
      const el = document.getElementById('toast');
      el.textContent = msg;
      el.className = 'toast toast-' + type + ' show';
      setTimeout(() => el.classList.remove('show'), 3500);
    }

    // ══════════════════════════════════════════════════════
    // ── DASHBOARD ────────────────────────────────────────
    // ══════════════════════════════════════════════════════
    async function loadStats() {
      try {
        const res = await fetch('/api/stats');
        state.stats = await res.json();
        const d = state.stats;

        // Nav badges
        document.getElementById('nav-total').textContent = d.toplam || 0;
        document.getElementById('nav-responded').textContent = d.donus_yapan || 0;

        // Stat cards
        document.getElementById('stats-grid').innerHTML = [
          { label: 'Toplam İşletme', value: d.toplam, color: 'accent', icon: '📋' },
          { label: 'Telefonu Olan', value: d.telefonu_olan, color: 'emerald', icon: '📱' },
          { label: 'Mesaj Gönderilen', value: d.mesaj_basarili, color: 'cyan', icon: '✉️' },
          { label: 'Dönüş Yapan', value: d.donus_yapan, color: 'purple', icon: '💬' },
          { label: 'Müşteri Olan', value: d.musteri_oldu, color: 'amber', icon: '🎉' },
          { label: 'Başarısız Mesaj', value: d.mesaj_basarisiz, color: 'rose', icon: '❌' },
        ].map(s =>
          '<div class="stat-card" data-color="' + s.color + '">' +
            '<div class="stat-label">' + s.icon + ' ' + s.label + '</div>' +
            '<div class="stat-value">' + (s.value || 0).toLocaleString('tr-TR') + '</div>' +
          '</div>'
        ).join('');

        // Charts
        const colors = ['accent', 'emerald', 'amber', 'purple', 'cyan', 'rose'];
        function barChart(items, labelKey, valueKey) {
          if (!items || items.length === 0) return '<div style="color:var(--text-muted);font-size:12px;padding:20px;text-align:center">Veri yok</div>';
          const mx = Math.max(...items.map(i => i[valueKey]));
          return items.slice(0, 8).map((it, i) => {
            const pct = mx > 0 ? (it[valueKey] / mx * 100) : 0;
            const c = colors[i % colors.length];
            return '<div class="bar-item">' +
              '<span class="bar-label">' + (it[labelKey] || '?') + '</span>' +
              '<div class="bar-track"><div class="bar-fill" style="width:' + pct + '%;background:var(--' + c + ')"></div></div>' +
              '<span class="bar-count">' + it[valueKey] + '</span></div>';
          }).join('');
        }

        document.getElementById('charts-area').innerHTML =
          '<div class="card"><div class="card-title">📂 Kategoriye Göre Dağılım</div>' + barChart(d.kategoriler, 'kategori', 'toplam') + '</div>' +
          '<div class="card"><div class="card-title">📍 İlçeye Göre Dağılım</div>' + barChart(d.ilceler, 'ilce', 'toplam') + '</div>';

        // Build filter dropdowns (for customers page)
        buildFilters();
      } catch (err) { console.error('Stats hatası:', err); }
    }

    function buildFilters() {
      if (!state.stats) return;
      const d = state.stats;
      document.getElementById('customers-filters').innerHTML =
        '<select class="filter-select" id="f-kat" onchange="state.filters.kategori=this.value;state.custPage=0;loadCustomers()">' +
          '<option value="">Tüm Kategoriler</option>' +
          (d.kategoriler || []).map(k => '<option value="' + k.kategori + '">' + k.kategori + ' (' + k.toplam + ')</option>').join('') +
        '</select>' +
        '<select class="filter-select" id="f-ilce" onchange="state.filters.ilce=this.value;state.custPage=0;loadCustomers()">' +
          '<option value="">Tüm İlçeler</option>' +
          (d.ilceler || []).map(d2 => '<option value="' + d2.ilce + '">' + (d2.ilce || '?') + ' (' + d2.toplam + ')</option>').join('') +
        '</select>' +
        '<select class="filter-select" id="f-durum" onchange="state.filters.durum=this.value;state.custPage=0;loadCustomers()">' +
          '<option value="">Tüm Durumlar</option>' +
          '<option value="yeni">Yeni</option>' +
          '<option value="telefon_var">Telefon Var</option>' +
          '<option value="telefon_yok">Telefon Yok</option>' +
          '<option value="mesaj_gonderildi">Mesaj Gönderildi</option>' +
          '<option value="donus_yapti">Dönüş Yaptı</option>' +
          '<option value="musteri_oldu">Müşteri Oldu</option>' +
          '<option value="numara_kayitsiz">Numara Kayıtsız</option>' +
          '<option value="ilgilenmiyor">İlgilenmiyor</option>' +
        '</select>' +
        '<select class="filter-select" id="f-sort" onchange="state.filters.sort=this.value;state.custPage=0;loadCustomers()">' +
          '<option value="oncelik">Öncelik Skoru</option>' +
          '<option value="puan">Puan</option>' +
          '<option value="yorum">Yorum Sayısı</option>' +
          '<option value="isim">İsim</option>' +
          '<option value="tarih">Ekleme Tarihi</option>' +
        '</select>' +
        '<input type="text" class="filter-input" id="f-search" placeholder="🔍 İsim, adres veya telefon ara..." oninput="state.filters.search=this.value;debounce(()=>{state.custPage=0;loadCustomers()},400)()">';
    }

    // ══════════════════════════════════════════════════════
    // ── CUSTOMERS ────────────────────────────────────────
    // ══════════════════════════════════════════════════════
    async function loadCustomers() {
      try {
        const f = state.filters;
        const params = new URLSearchParams({
          kategori: f.kategori, ilce: f.ilce, durum: f.durum,
          sort: f.sort, search: f.search,
          limit: state.custSize, offset: state.custPage * state.custSize
        });

        const res = await fetch('/api/customers?' + params);
        const { data, total } = await res.json();
        state.custTotal = total;

        const tbody = document.getElementById('customers-tbody');
        if (!data || data.length === 0) {
          tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:40px;color:var(--text-muted)">Kayıt bulunamadı</td></tr>';
          updateCustPag();
          return;
        }

        tbody.innerHTML = data.map(c => {
          const p = c.oncelik_skoru || 0;
          const pClass = p >= 50 ? 'p-high' : p >= 30 ? 'p-med' : 'p-low';
          const pW = Math.min(p, 80) / 80 * 50;

          return '<tr onclick="openDrawer(' + c.id + ')">' +
            '<td style="font-weight:600;color:var(--text-primary);max-width:200px;overflow:hidden;text-overflow:ellipsis">' + (c.isim || '—') + '</td>' +
            '<td>' + (c.kategori || '—') + '</td>' +
            '<td>' + (c.ilce || '—') + '</td>' +
            '<td style="font-family:monospace;font-size:11px">' + (c.telefon || '—') + '</td>' +
            '<td style="color:var(--amber)">' + (c.puan ? '⭐ ' + c.puan : '—') + '</td>' +
            '<td>' + (c.yorum_sayisi || 0) + '</td>' +
            '<td><div class="priority-bar"><div class="priority-fill ' + pClass + '" style="width:' + pW + 'px"></div><span style="font-size:10px;color:var(--text-muted)">' + p + '</span></div></td>' +
            '<td>' + statusBadge(c.durum) + '</td>' +
            '<td><button class="btn btn-sm btn-icon" onclick="event.stopPropagation();openDrawer(' + c.id + ')" title="Detay">👁</button></td>' +
          '</tr>';
        }).join('');

        updateCustPag();
      } catch (err) { console.error('Müşteri hatası:', err); }
    }

    function updateCustPag() {
      const from = state.custTotal > 0 ? state.custPage * state.custSize + 1 : 0;
      const to = Math.min((state.custPage + 1) * state.custSize, state.custTotal);
      document.getElementById('cust-info').textContent = from + ' – ' + to + ' / ' + state.custTotal + ' kayıt';
      document.getElementById('cust-prev').disabled = state.custPage === 0;
      document.getElementById('cust-next').disabled = to >= state.custTotal;
    }

    function custPrev() { if (state.custPage > 0) { state.custPage--; loadCustomers(); } }
    function custNext() { if ((state.custPage + 1) * state.custSize < state.custTotal) { state.custPage++; loadCustomers(); } }

    // ══════════════════════════════════════════════════════
    // ── CUSTOMER DRAWER ──────────────────────────────────
    // ══════════════════════════════════════════════════════
    async function openDrawer(id) {
      try {
        const res = await fetch('/api/customers/' + id);
        const { customer, messages } = await res.json();
        state.currentCustomer = customer;

        document.getElementById('drawer-title').textContent = customer.isim || 'Müşteri Detayı';

        // Body
        document.getElementById('drawer-body').innerHTML =
          '<div class="detail-section">' +
            '<h4>📋 Genel Bilgiler</h4>' +
            detailRow('Kategori', customer.kategori) +
            detailRow('İlçe', customer.ilce) +
            detailRow('Adres', customer.adres || '—') +
            detailRow('Telefon', customer.telefon ? '<strong style="color:var(--emerald)">' + customer.telefon + '</strong>' : '<span style="color:var(--rose)">Yok</span>') +
            detailRow('Puan', customer.puan ? '⭐ ' + customer.puan + ' (' + (customer.yorum_sayisi || 0) + ' yorum)' : '—') +
            detailRow('Öncelik', '<strong>' + (customer.oncelik_skoru || 0) + '</strong> puan') +
            detailRow('Durum', statusBadge(customer.durum)) +
            detailRow('Eklenme', customer.ekleme_tarihi || '—') +
            (customer.donus_tarihi ? detailRow('Dönüş Tarihi', customer.donus_tarihi) : '') +
          '</div>' +

          '<div class="detail-section">' +
            '<h4>📝 Notlar</h4>' +
            '<textarea class="note-textarea" id="note-text" placeholder="Müşteri hakkında not ekleyin...">' + (customer.notlar || '') + '</textarea>' +
            '<div style="margin-top:8px;text-align:right"><button class="btn btn-sm btn-primary" onclick="saveNote()">💾 Kaydet</button></div>' +
          '</div>' +

          '<div class="detail-section">' +
            '<h4>📨 Mesaj Geçmişi (' + messages.length + ')</h4>' +
            (messages.length > 0 ?
              messages.map(m =>
                '<div style="padding:10px;margin-bottom:8px;background:var(--bg-card);border:1px solid var(--border-color);border-radius:8px">' +
                  '<div style="display:flex;justify-content:space-between;margin-bottom:4px">' +
                    '<span style="font-size:11px;color:var(--text-muted)">' + (m.gonderim_zamani || '') + '</span>' +
                    '<span>' + (m.durum === 'gonderildi' ? '<span class="badge badge-sent">✅</span>' : m.durum === 'beklemede' ? '<span class="badge badge-new">⏳</span>' : '<span class="badge badge-nophone">❌</span>') + '</span>' +
                  '</div>' +
                  '<div style="font-size:11px;color:var(--text-secondary);white-space:pre-wrap;max-height:80px;overflow:hidden">' + (m.mesaj || '—').substring(0, 200) + '</div>' +
                  (m.mesaj_tipi && m.mesaj_tipi !== 'otomatik' ? '<div style="margin-top:4px"><span class="badge badge-responded">' + m.mesaj_tipi + '</span></div>' : '') +
                '</div>'
              ).join('')
            : '<div style="text-align:center;padding:20px;color:var(--text-muted);font-size:12px">Henüz mesaj gönderilmemiş</div>') +
          '</div>';

        // Actions
        const actions = [];
        if (customer.telefon) {
          actions.push('<button class="btn btn-primary" onclick="openMsgModal()">📨 Mesaj Gönder</button>');
          actions.push('<button class="btn btn-success" onclick="openMsgModalWithTemplate()">💰 Fiyat Bilgisi</button>');
        }
        if (customer.durum === 'mesaj_gonderildi') {
          actions.push('<button class="btn" style="background:var(--purple-glow);color:var(--purple);border-color:var(--purple)" onclick="markResponded(\'donus_yapti\')">💬 Dönüş Yaptı</button>');
        }
        if (customer.durum === 'donus_yapti') {
          actions.push('<button class="btn btn-success" onclick="markResponded(\'musteri_oldu\')">🎉 Müşteri Oldu</button>');
          actions.push('<button class="btn btn-danger btn-sm" onclick="markResponded(\'ilgilenmiyor\')">İlgilenmiyor</button>');
        }

        document.getElementById('drawer-actions').innerHTML = actions.join('');

        // Open
        document.getElementById('drawer-overlay').classList.add('open');
        document.getElementById('customer-drawer').classList.add('open');
      } catch (err) {
        console.error('Drawer hatası:', err);
        toast('Müşteri bilgisi yüklenemedi', 'error');
      }
    }

    function detailRow(label, value) {
      return '<div class="detail-row"><span class="detail-label">' + label + '</span><span class="detail-value">' + (value || '—') + '</span></div>';
    }

    function closeDrawer() {
      document.getElementById('drawer-overlay').classList.remove('open');
      document.getElementById('customer-drawer').classList.remove('open');
    }

    async function saveNote() {
      if (!state.currentCustomer) return;
      const not = document.getElementById('note-text').value;
      try {
        await fetch('/api/customers/' + state.currentCustomer.id + '/add-note', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ not })
        });
        toast('Not kaydedildi ✅');
      } catch (err) { toast('Hata: ' + err.message, 'error'); }
    }

    async function markResponded(durum) {
      if (!state.currentCustomer) return;
      try {
        await fetch('/api/customers/' + state.currentCustomer.id + '/mark-responded', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ durum })
        });
        const labels = { donus_yapti: 'Dönüş yaptı', musteri_oldu: 'Müşteri oldu', ilgilenmiyor: 'İlgilenmiyor' };
        toast('Durum güncellendi: ' + (labels[durum] || durum) + ' ✅');
        closeDrawer();
        loadAll();
      } catch (err) { toast('Hata: ' + err.message, 'error'); }
    }

    // ══════════════════════════════════════════════════════
    // ── MESSAGE COMPOSE MODAL ────────────────────────────
    // ══════════════════════════════════════════════════════
    async function loadTemplates() {
      try {
        const res = await fetch('/api/templates');
        state.templates = await res.json();
      } catch { state.templates = []; }
    }

    function openMsgModal(preselect) {
      if (!state.currentCustomer || !state.currentCustomer.telefon) {
        toast('Bu müşterinin telefon numarası yok!', 'error');
        return;
      }

      const c = state.currentCustomer;
      const body = document.getElementById('msg-modal-body');

      body.innerHTML =
        '<div style="margin-bottom:16px">' +
          '<div style="font-size:13px;color:var(--text-secondary);margin-bottom:4px">Alıcı:</div>' +
          '<div style="font-size:15px;font-weight:600">' + c.isim + ' <span style="color:var(--text-muted);font-size:12px">(' + c.telefon + ')</span></div>' +
        '</div>' +
        '<div style="margin-bottom:14px">' +
          '<div style="font-size:12px;font-weight:600;color:var(--text-muted);margin-bottom:8px">📋 ŞABLONLAR</div>' +
          state.templates.map((t, i) =>
            '<div class="template-card' + (preselect === t.id ? ' selected' : '') + '" onclick="selectTemplate(' + i + ')" id="tpl-' + i + '">' +
              '<h5>' + t.name + ' — ' + t.price + '</h5>' +
              '<p>Hazır fiyat teklifi şablonu</p>' +
            '</div>'
          ).join('') +
          '<div class="template-card" onclick="clearTemplate()" id="tpl-custom">' +
            '<h5>✍️ Özel Mesaj</h5>' +
            '<p>Kendi mesajınızı yazın</p>' +
          '</div>' +
        '</div>' +
        '<div>' +
          '<div style="font-size:12px;font-weight:600;color:var(--text-muted);margin-bottom:8px">MESAJ İÇERİĞİ</div>' +
          '<textarea class="msg-textarea" id="msg-content" placeholder="Mesajınızı buraya yazın...">' +
            (preselect ? (state.templates.find(t => t.id === preselect)?.message || '').replace(/{isim}/g, c.isim || 'Sayın İşletme') : '') +
          '</textarea>' +
        '</div>';

      document.getElementById('msg-modal-footer').innerHTML =
        '<button class="btn" onclick="closeMsgModal()">İptal</button>' +
        '<button class="btn btn-primary" onclick="sendCustomMsg()">📨 Gönder</button>';

      document.getElementById('msg-modal-overlay').classList.add('open');
    }

    function openMsgModalWithTemplate() {
      openMsgModal('baslangic');
    }

    function selectTemplate(idx) {
      document.querySelectorAll('.template-card').forEach(c => c.classList.remove('selected'));
      document.getElementById('tpl-' + idx).classList.add('selected');
      const t = state.templates[idx];
      const c = state.currentCustomer;
      document.getElementById('msg-content').value = (t.message || '')
        .replace(/{isim}/g, c.isim || 'Sayın İşletme')
        .replace(/{kategori}/g, c.kategori || '')
        .replace(/{ilce}/g, c.ilce || '');
    }

    function clearTemplate() {
      document.querySelectorAll('.template-card').forEach(c => c.classList.remove('selected'));
      document.getElementById('tpl-custom').classList.add('selected');
      document.getElementById('msg-content').value = '';
      document.getElementById('msg-content').focus();
    }

    function closeMsgModal() {
      document.getElementById('msg-modal-overlay').classList.remove('open');
    }

    async function sendCustomMsg() {
      const msg = document.getElementById('msg-content').value.trim();
      if (!msg) { toast('Mesaj boş olamaz!', 'error'); return; }
      if (!state.currentCustomer) return;

      const selectedTpl = document.querySelector('.template-card.selected');
      const isTpl = selectedTpl && !selectedTpl.id.includes('custom');
      const messageType = isTpl ? 'fiyat_bilgisi' : 'ozel';

      try {
        const res = await fetch('/api/send-custom-message', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customerId: state.currentCustomer.id,
            message: msg,
            messageType
          })
        });
        const data = await res.json();
        if (data.success) {
          toast('Mesaj kuyruğa eklendi! Gönderiliyor... 📨', 'info');
          closeMsgModal();
          closeDrawer();
        } else {
          toast('Hata: ' + (data.error || 'Bilinmeyen'), 'error');
        }
      } catch (err) { toast('Bağlantı hatası: ' + err.message, 'error'); }
    }

    // ══════════════════════════════════════════════════════
    // ── RESPONDED PAGE ───────────────────────────────────
    // ══════════════════════════════════════════════════════
    async function loadResponded() {
      try {
        const search = document.getElementById('resp-search')?.value || '';
        const res = await fetch('/api/customers/responded?search=' + encodeURIComponent(search));
        const { data } = await res.json();

        const grid = document.getElementById('responded-grid');

        if (!data || data.length === 0) {
          grid.innerHTML = '<div style="text-align:center;padding:60px;color:var(--text-muted);grid-column:1/-1">' +
            '<div style="font-size:40px;margin-bottom:12px">💬</div>' +
            '<div style="font-size:14px;font-weight:600;margin-bottom:6px">Henüz dönüş yapan müşteri yok</div>' +
            '<div style="font-size:12px">Mesaj gönderilen müşterilerden dönüş geldiğinde buraya ekleyin</div></div>';
          return;
        }

        grid.innerHTML = data.map(c =>
          '<div class="responded-card" onclick="openDrawer(' + c.id + ')">' +
            '<div class="rc-header">' +
              '<span class="rc-name">' + (c.isim || '—') + '</span>' +
              statusBadge(c.durum) +
            '</div>' +
            '<div class="rc-info">📂 ' + (c.kategori || '—') + ' · 📍 ' + (c.ilce || '—') + ' · 📱 ' + (c.telefon || '—') + '</div>' +
            (c.notlar ? '<div class="rc-note">' + c.notlar.substring(0, 120) + '</div>' : '') +
            '<div style="font-size:10px;color:var(--text-muted);margin-bottom:8px">Dönüş: ' + (c.donus_tarihi || '—') + '</div>' +
            '<div class="rc-actions">' +
              (c.telefon ? '<button class="btn btn-sm btn-primary" onclick="event.stopPropagation();quickMsg(' + c.id + ')">📨 Mesaj</button>' : '') +
              (c.telefon ? '<button class="btn btn-sm btn-success" onclick="event.stopPropagation();quickPrice(' + c.id + ')">💰 Fiyat</button>' : '') +
              (c.durum === 'donus_yapti' ? '<button class="btn btn-sm" style="background:var(--emerald-glow);color:var(--emerald);border-color:var(--emerald)" onclick="event.stopPropagation();quickStatus(' + c.id + ',\'musteri_oldu\')">🎉 Müşteri</button>' : '') +
            '</div>' +
          '</div>'
        ).join('');
      } catch (err) { console.error('Responded hatası:', err); }
    }

    async function quickMsg(id) {
      await openDrawer(id);
      setTimeout(() => openMsgModal(), 300);
    }

    async function quickPrice(id) {
      await openDrawer(id);
      setTimeout(() => openMsgModal('baslangic'), 300);
    }

    async function quickStatus(id, durum) {
      try {
        await fetch('/api/customers/' + id + '/mark-responded', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ durum })
        });
        toast('Durum güncellendi ✅');
        loadResponded();
        loadStats();
      } catch (err) { toast('Hata', 'error'); }
    }

    // ══════════════════════════════════════════════════════
    // ── MESSAGES ─────────────────────────────────────────
    // ══════════════════════════════════════════════════════
    async function loadMessages() {
      try {
        const res = await fetch('/api/messages?limit=100');
        const { data } = await res.json();

        const tbody = document.getElementById('messages-tbody');
        if (!data || data.length === 0) {
          tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text-muted)">Henüz mesaj gönderilmemiş</td></tr>';
          return;
        }

        tbody.innerHTML = data.map(m => {
          let sBadge = m.durum === 'gonderildi' ? '<span class="badge badge-sent">✅ Gönderildi</span>'
            : m.durum === 'beklemede' ? '<span class="badge badge-new">⏳ Beklemede</span>'
            : m.durum === 'numara_kayitsiz' ? '<span class="badge badge-unreg">⚠️ Kayıtsız</span>'
            : '<span class="badge badge-nophone">❌ Hata</span>';

          let tipBadge = '';
          if (m.mesaj_tipi === 'fiyat_bilgisi') tipBadge = '<span class="badge badge-responded">💰 Fiyat</span>';
          else if (m.mesaj_tipi === 'ozel') tipBadge = '<span class="badge badge-new">✍️ Özel</span>';
          else tipBadge = '<span class="badge" style="background:rgba(255,255,255,0.03);color:var(--text-muted);border:1px solid var(--border-color)">🤖 Oto</span>';

          return '<tr>' +
            '<td style="font-weight:500;color:var(--text-primary)">' + (m.isim || '—') + '</td>' +
            '<td style="font-family:monospace;font-size:11px">' + (m.telefon || '—') + '</td>' +
            '<td>' + (m.kategori || '—') + '</td>' +
            '<td>' + tipBadge + '</td>' +
            '<td style="font-size:11px">' + (m.gonderim_zamani || '—') + '</td>' +
            '<td>' + sBadge + '</td>' +
            '<td style="font-size:10px;color:var(--text-muted);max-width:150px;overflow:hidden;text-overflow:ellipsis">' + (m.hata_mesaji || '—') + '</td>' +
          '</tr>';
        }).join('');
      } catch (err) { console.error('Mesaj hatası:', err); }
    }

    // ══════════════════════════════════════════════════════
    // ── SCRAPER & BULK SEND ───────────────────────────────
    // ══════════════════════════════════════════════════════
    async function startScraper() {
      if (!confirm('Google Haritalar tarama işlemini başlatmak istiyor musunuz?\nArka planda seçilen bölgelerdeki işletmeleri toplayacaktır.')) return;
      try {
        const res = await fetch('/api/run-scraper', { method: 'POST' });
        const data = await res.json();
        if (data.success) toast('Tarama başlatıldı! Arka planda çalışıyor.', 'info');
        else toast('Hata: ' + data.error, 'error');
      } catch (err) { toast('Bağlantı hatası', 'error'); }
    }

    let qrPollInterval = null;
    let qrCodeInstance = null;

    function closeQrModal() {
      document.getElementById('qr-modal-overlay').classList.remove('active');
      if (qrPollInterval) clearInterval(qrPollInterval);
    }

    async function startBulkSend() {
      if (!confirm('Toplu mesaj gönderimini başlatmak istiyor musunuz?')) return;
      try {
        const res = await fetch('/api/send-messages', { method: 'POST' });
        const data = await res.json();
        if (data.success) {
          toast('Toplu mesaj başlatılıyor...', 'info');
          document.getElementById('qr-modal-overlay').classList.add('active');
          document.getElementById('qr-container').innerHTML = 'QR kodu bekleniyor...';
          
          if (qrPollInterval) clearInterval(qrPollInterval);
          qrPollInterval = setInterval(async () => {
            try {
              const qrRes = await fetch('/api/qr');
              const qrData = await qrRes.json();
              if (qrData.success && qrData.qr) {
                if (qrData.qr === 'CONNECTED') {
                  clearInterval(qrPollInterval);
                  closeQrModal();
                  toast('WhatsApp bağlandı, gönderim başladı!', 'success');
                } else if (qrData.qr !== 'WAITING') {
                  document.getElementById('qr-container').innerHTML = '';
                  if (!qrCodeInstance) {
                     qrCodeInstance = new QRCode(document.getElementById('qr-container'), {
                       text: qrData.qr, width: 256, height: 256
                     });
                  } else {
                     qrCodeInstance.clear();
                     qrCodeInstance.makeCode(qrData.qr);
                  }
                }
              }
            } catch(e) {}
          }, 2000);
        } else {
          toast('Hata: ' + data.error, 'error');
        }
      } catch (err) { toast('Bağlantı hatası', 'error'); }
    }

    let sysLogInterval = null;

    function closeSysLogs() {
      document.getElementById('sys-log-modal').classList.remove('active');
      if (sysLogInterval) clearInterval(sysLogInterval);
    }

    function openSysLogs() {
      document.getElementById('sys-log-modal').classList.add('active');
      pollSysLogs();
      if (sysLogInterval) clearInterval(sysLogInterval);
      sysLogInterval = setInterval(pollSysLogs, 1500);
    }

    async function pollSysLogs() {
      try {
        const res = await fetch('/api/sys-logs');
        const data = await res.json();
        
        document.getElementById('log-scraper').textContent = data.scraperLogs.join('\n');
        document.getElementById('log-sender').textContent = data.senderLogs.join('\n');
        
        const scraperEl = document.getElementById('log-scraper');
        scraperEl.scrollTop = scraperEl.scrollHeight;
        const senderEl = document.getElementById('log-sender');
        senderEl.scrollTop = senderEl.scrollHeight;

        document.getElementById('btn-stop-scraper').style.display = data.scraperRunning ? 'block' : 'none';
        document.getElementById('btn-stop-sender').style.display = data.senderRunning ? 'block' : 'none';
      } catch (err) {}
    }

    async function stopProcess(type) {
      if (!confirm(type + ' işlemini durdurmak istediğinize emin misiniz?')) return;
      try {
        const res = await fetch('/api/stop-' + type, { method: 'POST' });
        const data = await res.json();
        if (data.success) toast('İşlem durduruldu', 'success');
        else toast('Hata: ' + data.error, 'error');
        pollSysLogs();
      } catch(err) {}
    }

    // ══════════════════════════════════════════════════════
    // ── INIT ─────────────────────────────────────────────
    // ══════════════════════════════════════════════════════
    async function loadAll() {
      await loadStats();
      await loadTemplates();
      if (state.page === 'customers') loadCustomers();
      if (state.page === 'responded') loadResponded();
      if (state.page === 'messages') loadMessages();
    }

    loadAll();
    setInterval(() => { loadStats(); }, 30000);
  