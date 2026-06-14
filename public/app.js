const api = (path, opts) => fetch(path, opts).then(r=>r.json());

document.addEventListener('DOMContentLoaded', ()=>{
  const registerForm = document.getElementById('registerForm');
  const loginForm = document.getElementById('loginForm');
  const servicesSection = document.getElementById('services');
  const pixSection = document.getElementById('pix');
  const supportSection = document.getElementById('support');
  const btnServices = document.getElementById('btnServices');
  const btnPix = document.getElementById('btnPix');
  const btnSupport = document.getElementById('btnSupport');
  const waLink = document.getElementById('waLink');

  waLink.href = 'https://wa.me/5563991105288?text=Olá%20Medeiros%20Advocacia,%20gostaria%20de%20um%20atendimento.';

  // mostrar status do usuário
  const userArea = document.getElementById('userArea');
  const renderUser = (user) => {
    if(!user){
      userArea.innerHTML = '<a href="#" id="showAuth">Entrar / Criar conta</a>';
      const el = document.getElementById('showAuth');
      if(el) el.addEventListener('click', ()=>{ document.getElementById('auth').scrollIntoView(); });
    } else {
      userArea.innerHTML = `<span>${user.email}${user.confirmed?'' : ' (não confirmado)'}</span> <button id="btnLogout">Sair</button>`;
      const btnLogout = document.getElementById('btnLogout');
      if(btnLogout) btnLogout.addEventListener('click', async ()=>{ await api('/api/logout',{method:'POST'}); alert('Desconectado'); location.reload(); });
    }
  };
  // fetch user
  api('/api/me').then(data=>{ renderUser(data.user); }).catch(()=>{});

  btnServices.addEventListener('click', ()=>{ servicesSection.classList.remove('hidden'); pixSection.classList.add('hidden'); supportSection.classList.add('hidden');});
  btnPix.addEventListener('click', ()=>{ pixSection.classList.remove('hidden'); servicesSection.classList.add('hidden'); supportSection.classList.add('hidden'); generatePixQr();});
  btnSupport.addEventListener('click', ()=>{ supportSection.classList.remove('hidden'); servicesSection.classList.add('hidden'); pixSection.classList.add('hidden');});

  registerForm.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const data = Object.fromEntries(new FormData(registerForm).entries());
    const res = await api('/api/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
    if(res.success){ alert('Cadastro realizado!'); } else { alert(res.error || 'Erro'); }
  });

  loginForm.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const data = Object.fromEntries(new FormData(loginForm).entries());
    const res = await api('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
    if(res.success){ alert('Logado com sucesso'); location.reload(); } else { alert(res.error || 'Erro'); }
  });

  document.querySelectorAll('.hireBtn').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const service = btn.dataset.service;
      const message = prompt('Descreva o que deseja (opcional):');
      const res = await api('/api/hire',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({service,message})});
      if(res.success) alert('Contratação registrada! Entraremos em contato via WhatsApp.');
      else alert(res.error || 'Erro ao contratar');
    });
  });

  const pixForm = document.getElementById('pixForm');
  pixForm.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const data = Object.fromEntries(new FormData(pixForm).entries());
    const res = await api('/api/pix',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
    if(res.success) alert('Pagamento registrado. Use o PIX chave: ' + res.pix_key);
    else alert(res.error || 'Erro no pagamento');
  });

  // opcional: criar cobrança via gateway (mock)
  const createChargeBtn = document.getElementById('createCharge');
  if(createChargeBtn){
    createChargeBtn.addEventListener('click', async ()=>{
      const amount = prompt('Valor da cobrança (ex: 50.00)');
      if(!amount) return;
      const res = await api('/api/gateway/create-charge',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({amount})});
      if(res && res.charge && res.qr){
        alert('Cobrança criada: ' + res.charge.id);
        document.getElementById('pixQr').src = res.qr;
      } else alert('Erro ao criar cobrança');
    });
  }

  // request password reset
  const requestResetBtn = document.getElementById('requestReset');
  if(requestResetBtn){
    requestResetBtn.addEventListener('click', async ()=>{
      const email = prompt('Digite seu email cadastrado:');
      if(!email) return;
      const res = await api('/api/request-reset',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email})});
      alert('Se o email estiver cadastrado, você receberá instruções.');
    });
  }

});

function generatePixQr(){
  const key = encodeURIComponent('joaolucasayressoares953@gmail.com');
  const qr = document.getElementById('pixQr');
  // Gera QR via serviço público (pode trocar por biblioteca local)
  qr.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${key}`;
}
