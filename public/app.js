// ============================================================
// MetLife Assist — Frontend Application Controller
// ============================================================

// Global State
let chatHistory = [];
let isAccessibilityActive = false;
let isEmergencyActive = false;
let currentLanguage = 'en';
let countdownInterval = null;

// DOM Elements
const chatBody = document.getElementById('chatBody');
const chatForm = document.getElementById('chatForm');
const userInput = document.getElementById('userInput');
const sendBtn = document.getElementById('sendBtn');
const voiceBtn = document.getElementById('voiceBtn');
const langSelector = document.getElementById('langSelector');
const accessibilityToggle = document.getElementById('accessibilityToggle');
const accessibilityPanel = document.getElementById('accessibilityPanel');
const accessibilityHeaderBanner = document.getElementById('accessibilityHeaderBanner');
const transportContainer = document.getElementById('transportStatusContainer');
const concessionContainer = document.getElementById('concessionStatusContainer');
const emergencyToggle = document.getElementById('emergencyToggle');
const emergencyBanner = document.getElementById('emergencyBanner');
const dismissEmergency = document.getElementById('dismissEmergency');

// ============================================================
// INITIALIZATION
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  lucide.createIcons();
  fetchStadiumData();
  startMatchCountdown();
  initHeatmapColors();

  // Event Listeners
  chatForm.addEventListener('submit', handleChatSubmit);
  voiceBtn.addEventListener('click', handleVoiceClick);
  langSelector.addEventListener('change', handleLanguageChange);
  accessibilityToggle.addEventListener('click', handleAccessibilityToggle);
  emergencyToggle.addEventListener('click', handleEmergencyToggle);
  if (dismissEmergency) dismissEmergency.addEventListener('click', handleEmergencyToggle);

  // Delegation for chips & accessibility buttons
  document.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    const accChip = e.target.closest('.btn-acc-chip');
    if (chip) submitQuery(chip.getAttribute('data-query'));
    else if (accChip) submitQuery(accChip.getAttribute('data-query'));
  });

  // GSAP Entrance Animations
  runGSAPEntranceAnimations();
});

// ============================================================
// GSAP ENTRANCE ANIMATIONS
// ============================================================
function runGSAPEntranceAnimations() {
  if (typeof gsap === 'undefined') return;

  const tl = gsap.timeline();

  tl.from(".app-header", {
    y: -70, opacity: 0, duration: 0.8, ease: "power4.out"
  });

  tl.from(".live-status-header", {
    x: -30, opacity: 0, duration: 0.5, ease: "power2.out"
  }, "-=0.4");

  // Stagger sidebar widgets (using fromTo to guarantee end state)
  tl.fromTo(".sidebar-widget", 
    { y: 20, opacity: 0 },
    { y: 0, opacity: 1, duration: 0.5, stagger: 0.1, ease: "power2.out" },
    "-=0.3"
  );

  tl.from(".chat-container", {
    y: 35, opacity: 0, duration: 0.8, ease: "power3.out"
  }, "-=0.5");

  tl.from(".bot-message", {
    scale: 0.95, opacity: 0, duration: 0.5, ease: "power2.out"
  }, "-=0.2");
}

// ============================================================
// MATCH COUNTDOWN TIMER
// ============================================================
function startMatchCountdown() {
  // Simulate a kickoff 1.5 hours from now
  const kickoffTime = new Date();
  kickoffTime.setHours(kickoffTime.getHours() + 1);
  kickoffTime.setMinutes(kickoffTime.getMinutes() + 30);

  const cdHours = document.getElementById('cdHours');
  const cdMinutes = document.getElementById('cdMinutes');
  const cdSeconds = document.getElementById('cdSeconds');
  const matchTimer = document.getElementById('matchTimer');

  if (!cdHours || !cdMinutes || !cdSeconds) return;

  countdownInterval = setInterval(() => {
    const now = new Date();
    const diff = kickoffTime - now;

    if (diff <= 0) {
      clearInterval(countdownInterval);
      cdHours.textContent = '00';
      cdMinutes.textContent = '00';
      cdSeconds.textContent = '00';
      matchTimer.textContent = 'LIVE NOW';
      matchTimer.style.color = '#f87171';

      // Pulse animation on LIVE
      if (typeof gsap !== 'undefined') {
        gsap.to(matchTimer, {
          scale: 1.05, duration: 0.5, yoyo: true, repeat: -1, ease: "power1.inOut"
        });
      }
      return;
    }

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    cdHours.textContent = String(hours).padStart(2, '0');
    cdMinutes.textContent = String(minutes).padStart(2, '0');
    cdSeconds.textContent = String(seconds).padStart(2, '0');

    // Pulse seconds digit
    if (typeof gsap !== 'undefined') {
      gsap.fromTo(cdSeconds, { scale: 1.1 }, { scale: 1, duration: 0.3, ease: "power1.out" });
    }
  }, 1000);
}

// ============================================================
// CROWD DENSITY HEATMAP COLORS
// ============================================================
function initHeatmapColors() {
  const zones = document.querySelectorAll('.heatmap-zone[data-density]');
  zones.forEach(zone => {
    const density = parseInt(zone.getAttribute('data-density'));
    if (density === 0) return; // pitch cell

    // Grayscale opacity based on density (higher = brighter/more opaque)
    const opacity = Math.max(0.05, density / 100 * 0.7);
    zone.style.background = `rgba(255, 255, 255, ${opacity})`;

    // Color the percentage text based on severity
    const pctEl = zone.querySelector('.zone-pct');
    if (pctEl) {
      if (density >= 80) pctEl.style.color = '#f87171';
      else if (density >= 60) pctEl.style.color = '#fbbf24';
      else pctEl.style.color = '#d4d4d4';
    }
  });

  // Simulate live density updates every 8 seconds
  setInterval(() => {
    zones.forEach(zone => {
      const baseDensity = parseInt(zone.getAttribute('data-density'));
      if (baseDensity === 0) return;

      // Fluctuate ±5%
      const fluctuation = Math.floor(Math.random() * 11) - 5;
      const newDensity = Math.max(10, Math.min(99, baseDensity + fluctuation));

      const opacity = Math.max(0.05, newDensity / 100 * 0.7);
      const pctEl = zone.querySelector('.zone-pct');
      if (pctEl) {
        pctEl.textContent = `${newDensity}%`;
        if (newDensity >= 80) pctEl.style.color = '#f87171';
        else if (newDensity >= 60) pctEl.style.color = '#fbbf24';
        else pctEl.style.color = '#d4d4d4';
      }

      // Smooth transition
      if (typeof gsap !== 'undefined') {
        gsap.to(zone, { background: `rgba(255, 255, 255, ${opacity})`, duration: 1, ease: "power1.inOut" });
      } else {
        zone.style.background = `rgba(255, 255, 255, ${opacity})`;
      }
    });
  }, 8000);
}

// ============================================================
// EMERGENCY ALERT SYSTEM
// ============================================================
function handleEmergencyToggle() {
  isEmergencyActive = !isEmergencyActive;

  if (isEmergencyActive) {
    emergencyToggle.classList.add('active');
    emergencyBanner.classList.remove('hidden');
    document.body.style.borderTop = '3px solid #ef4444';

    if (typeof gsap !== 'undefined') {
      gsap.from(emergencyBanner, { height: 0, opacity: 0, duration: 0.4, ease: "power2.out" });
    }

    appendMessage('bot', null, {
      type: 'alert',
      title: '⚠️ Emergency Mode Activated',
      body: '**Emergency evacuation protocols are now displayed.** Follow illuminated exits and stadium staff directions.\n\n- **Gate C (East):** Accessible emergency exit\n- **Medical Stations:** Sections 110, 215, 318\n- **Security Hotline:** Extension 911 on courtesy phones',
      cards: [
        { label: 'Nearest Exit', value: 'Gate C (East)', status: 'critical' },
        { label: 'Medical Station', value: 'Sections 110, 215, 318', status: 'warning' }
      ],
      tip: 'If this is a life-threatening emergency, call 911 immediately.'
    });
  } else {
    emergencyToggle.classList.remove('active');
    emergencyBanner.classList.add('hidden');
    document.body.style.borderTop = 'none';
    appendMessage('bot', null, {
      type: 'standard',
      title: null,
      body: 'ℹ️ **Emergency mode deactivated.** Returning to normal operations.',
      cards: [],
      tip: null
    });
  }
  scrollToBottom();
}

// ============================================================
// FETCH STADIUM DATA FOR SIDEBAR WIDGETS
// ============================================================
async function fetchStadiumData() {
  try {
    const response = await fetch('/api/stadium-data');
    if (!response.ok) throw new Error('Network response not ok');
    
    const data = await response.json();
    renderTransportStatus(data.transport);
    renderConcessionStatus(data.concessions);
  } catch (error) {
    console.error('Error fetching stadium status data:', error);
    // Fallback: render static data directly
    renderTransportStatus([
      { type: "NJ Transit Rail", station: "Lot B Station", status: "On Time", frequency: "Every 10 min", notes: "Direct to NYC Penn Station" },
      { type: "Coach USA Bus", station: "Lot A Terminal", status: "Minor Delays", frequency: "Every 15 min", notes: "Route 3 traffic" },
      { type: "Rideshare (Uber/Lyft)", station: "Lot E", status: "High Demand", frequency: "20-25 min wait", notes: "Surge pricing active" }
    ]);
    renderConcessionStatus([
      { section: "112", name: "Goalpost Tacos", level: "Lower Bowl", waitTimeMinutes: 12, popularItem: "Carne Asada Nachos" },
      { section: "224", name: "Champions Club Burgers", level: "Club Level", waitTimeMinutes: 5, popularItem: "Trophy Cheeseburger" },
      { section: "318", name: "Strikers Hot Dogs", level: "Upper Bowl", waitTimeMinutes: 20, popularItem: "Footlong Jersey Dog" }
    ]);
  }
}

// Render Transportation Cards
function renderTransportStatus(transports) {
  if (!transportContainer) return;
  transportContainer.innerHTML = '';
  transports.forEach(item => {
    let statusClass = 'green';
    if (item.status.toLowerCase().includes('delay')) statusClass = 'yellow';
    if (item.status.toLowerCase().includes('suspended') || item.status.toLowerCase().includes('high')) statusClass = 'red';
    
    const card = document.createElement('div');
    card.className = 'status-card';
    card.innerHTML = `
      <div class="card-title-row">
        <span class="card-title">${item.type}</span>
        <span class="status-badge ${statusClass}">${item.status}</span>
      </div>
      <div class="card-detail">
        <span>${item.station}</span>
        <span>${item.frequency}</span>
      </div>
      <div class="card-subtext">${item.notes}</div>
    `;
    transportContainer.appendChild(card);
  });

  if (typeof gsap !== 'undefined') {
    gsap.from(transportContainer.querySelectorAll('.status-card'), {
      opacity: 0, y: 10, stagger: 0.08, duration: 0.4, ease: "power1.out"
    });
  }
}

// Render Concessions Cards
function renderConcessionStatus(concessions) {
  if (!concessionContainer) return;
  concessionContainer.innerHTML = '';
  concessions.forEach(item => {
    let statusClass = 'green';
    if (item.waitTimeMinutes > 10) statusClass = 'yellow';
    if (item.waitTimeMinutes > 15) statusClass = 'red';
    
    const card = document.createElement('div');
    card.className = 'status-card';
    card.innerHTML = `
      <div class="card-title-row">
        <span class="card-title">Sec ${item.section} • ${item.name}</span>
        <span class="status-badge ${statusClass}">${item.waitTimeMinutes}m wait</span>
      </div>
      <div class="card-detail">
        <span>${item.level}</span>
        <span>Popular: ${item.popularItem}</span>
      </div>
    `;
    concessionContainer.appendChild(card);
  });

  if (typeof gsap !== 'undefined') {
    gsap.from(concessionContainer.querySelectorAll('.status-card'), {
      opacity: 0, y: 10, stagger: 0.08, duration: 0.4, ease: "power1.out"
    });
  }
}

// ============================================================
// CHAT SUBMISSION & STRUCTURED RESPONSE RENDERING
// ============================================================
function submitQuery(query) {
  userInput.value = query;
  handleChatSubmit(new Event('submit'));
}

async function handleChatSubmit(e) {
  e.preventDefault();
  
  const text = userInput.value.trim();
  if (!text) return;
  
  userInput.value = '';
  appendMessage('user', text);
  scrollToBottom();
  
  // Add accessibility/language annotations
  let payloadText = text;
  if (isAccessibilityActive) {
    payloadText = `[User has Accessibility Mode Active - prioritize elevators, sensory rooms, ramps, and VIP Gate C entry] ${text}`;
  }
  if (currentLanguage !== 'en') {
    payloadText = `[User selected language: ${currentLanguage}. Respond in this language.] ${payloadText}`;
  }
  
  chatHistory.push({ role: 'user', content: payloadText });
  
  const typingIndicator = appendTypingIndicator();
  scrollToBottom();
  
  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: chatHistory })
    });
    
    typingIndicator.remove();
    
    if (!response.ok) throw new Error('API Response was not ok');
    
    const data = await response.json();
    
    // Try to parse structured response
    if (data.structured) {
      try {
        const structured = JSON.parse(data.text);
        appendMessage('bot', null, structured);
        chatHistory.push({ role: 'model', content: structured.body || data.text });
      } catch {
        appendMessage('bot', data.text);
        chatHistory.push({ role: 'model', content: data.text });
      }
    } else {
      appendMessage('bot', data.text);
      chatHistory.push({ role: 'model', content: data.text });
    }
    
    fetchStadiumData();
    
  } catch (error) {
    console.error('Error during chat request:', error);
    typingIndicator.remove();
    appendMessage('bot', null, {
      type: 'alert',
      title: 'Connection Error',
      body: "I'm having trouble connecting to the MetLife Stadium servers. Please check your connection and try again.",
      cards: [],
      tip: null
    });
  }
  
  scrollToBottom();
}

// ============================================================
// MESSAGE RENDERING (supports structured + plain text)
// ============================================================
function appendMessage(sender, text, structured = null) {
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${sender}-message`;
  
  // Add response type class for styling
  if (structured && structured.type) {
    messageDiv.classList.add(`response-${structured.type}`);
  }
  
  const avatarHtml = sender === 'bot' 
    ? `<div class="message-avatar"><i data-lucide="compass" class="avatar-icon"></i></div>`
    : `<div class="message-avatar"><i data-lucide="user" class="avatar-icon"></i></div>`;
    
  const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  
  let contentHtml = '';
  
  if (structured && sender === 'bot') {
    // Render structured response
    contentHtml = renderStructuredContent(structured);
  } else if (text) {
    contentHtml = formatMarkdown(text);
  }
  
  messageDiv.innerHTML = `
    ${avatarHtml}
    <div class="message-content">
      ${contentHtml}
      <span class="message-time">${timestamp}</span>
    </div>
  `;
  
  chatBody.appendChild(messageDiv);
  lucide.createIcons();

  // GSAP pop-in animation
  if (typeof gsap !== 'undefined') {
    gsap.fromTo(messageDiv, 
      { scale: 0.94, y: 15, opacity: 0 },
      { scale: 1, y: 0, opacity: 1, duration: 0.45, ease: "back.out(1.2)" }
    );
  }
}

// Render structured JSON response into rich HTML cards
function renderStructuredContent(data) {
  let html = '';
  
  // Title
  if (data.title) {
    html += `<div class="response-title">${data.title}</div>`;
  }
  
  // Body text (markdown formatted)
  if (data.body) {
    html += formatMarkdown(data.body);
  }
  
  // Data cards
  if (data.cards && data.cards.length > 0) {
    html += '<div class="response-cards">';
    data.cards.forEach(card => {
      const statusClass = card.status === 'good' ? 'rc-good' 
        : card.status === 'warning' ? 'rc-warning' 
        : card.status === 'critical' ? 'rc-critical' : '';
      html += `
        <div class="response-card ${statusClass}">
          <span class="rc-label">${card.label}</span>
          <span class="rc-value">${card.value}</span>
        </div>
      `;
    });
    html += '</div>';
  }
  
  // Tip
  if (data.tip) {
    html += `<div class="response-tip">${data.tip}</div>`;
  }
  
  return html;
}

// Typing Indicator
function appendTypingIndicator() {
  const indicatorDiv = document.createElement('div');
  indicatorDiv.className = 'message bot-message typing-container';
  indicatorDiv.innerHTML = `
    <div class="message-avatar"><i data-lucide="compass" class="avatar-icon"></i></div>
    <div class="message-content">
      <div class="typing-indicator">
        <span class="typing-dot"></span>
        <span class="typing-dot"></span>
        <span class="typing-dot"></span>
      </div>
    </div>
  `;
  chatBody.appendChild(indicatorDiv);
  lucide.createIcons();

  if (typeof gsap !== 'undefined') {
    gsap.fromTo(indicatorDiv, 
      { scale: 0.94, y: 10, opacity: 0 },
      { scale: 1, y: 0, opacity: 1, duration: 0.3, ease: "power1.out" }
    );
  }

  return indicatorDiv;
}

function scrollToBottom() {
  chatBody.scrollTop = chatBody.scrollHeight;
}

// ============================================================
// MARKDOWN PARSER
// ============================================================
function formatMarkdown(text) {
  let html = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  
  const lines = html.split('\n');
  let result = '';
  let inList = false;
  
  lines.forEach(line => {
    const trimmedLine = line.trim();
    
    if (trimmedLine.startsWith('- ') || trimmedLine.startsWith('* ')) {
      if (!inList) { result += '<ul>'; inList = true; }
      result += `<li>${trimmedLine.substring(2)}</li>`;
    } else {
      if (inList) { result += '</ul>'; inList = false; }
      if (trimmedLine) result += `<p>${trimmedLine}</p>`;
    }
  });
  
  if (inList) result += '</ul>';
  return result || html;
}

// ============================================================
// LANGUAGE SELECTOR
// ============================================================
function handleLanguageChange(e) {
  currentLanguage = e.target.value;
  
  const notices = {
    'es': "Idioma cambiado a Español. ¡MetLife Assist responderá en español!",
    'fr': "Langue changée en Français. MetLife Assist répondra en français !",
    'de': "Sprache auf Deutsch geändert. MetLife Assist wird auf Deutsch antworten!",
    'hi': "भाषा बदलकर हिन्दी कर दी गई है। मेटलाइफ असिस्ट हिन्दी में जवाब देगा!",
    'ar': "تم تغيير اللغة إلى العربية. ستجيب خدمة MetLife Assist باللغة العربية!",
    'pt': "Idioma alterado para Português. O MetLife Assist responderá em português!",
    'ja': "言語を日本語に変更しました。MetLife Assistは日本語で応答します！",
    'en': "Language set to English. MetLife Assist will respond in English!"
  };
  
  appendMessage('bot', null, {
    type: 'standard',
    title: null,
    body: `🌐 **System Notice:** ${notices[currentLanguage] || notices['en']}`,
    cards: [],
    tip: null
  });
  scrollToBottom();
}

// ============================================================
// ACCESSIBILITY TOGGLE
// ============================================================
function handleAccessibilityToggle() {
  isAccessibilityActive = !isAccessibilityActive;
  
  if (isAccessibilityActive) {
    document.body.classList.add('accessibility-active');
    accessibilityToggle.classList.add('active');
    accessibilityPanel.classList.remove('hidden');
    accessibilityHeaderBanner.classList.remove('hidden');
    
    appendMessage('bot', null, {
      type: 'navigation',
      title: '♿ Accessibility Assist Active',
      body: 'I will now prioritize step-free paths, escalators, elevators, wheelchair entries, and our sensory room near Section 212.',
      cards: [
        { label: 'Gate C (Accessible Entry)', value: '5 min wait — Low Traffic', status: 'good' },
        { label: 'Sensory Room', value: 'Section 212 — Club Level', status: 'good' }
      ],
      tip: 'Ask me about any section for personalized accessible route guidance.'
    });

    if (typeof gsap !== 'undefined') {
      gsap.from(accessibilityPanel, { height: 0, opacity: 0, duration: 0.4, ease: "power2.out" });
    }
  } else {
    document.body.classList.remove('accessibility-active');
    accessibilityToggle.classList.remove('active');
    accessibilityPanel.classList.add('hidden');
    accessibilityHeaderBanner.classList.add('hidden');
    appendMessage('bot', null, {
      type: 'standard',
      title: null,
      body: 'ℹ️ **Accessibility Assist Disabled:** Returned to standard navigation paths.',
      cards: [],
      tip: null
    });
  }
  scrollToBottom();
}

// ============================================================
// MOCK VOICE INPUT
// ============================================================
function handleVoiceClick() {
  const pulseEl = voiceBtn.querySelector('.mic-pulse');
  const iconEl = voiceBtn.querySelector('.mic-icon');
  
  pulseEl.style.animation = 'pulse-white-glow 1.8s infinite';
  pulseEl.style.opacity = '1';
  iconEl.style.color = 'var(--accent-white)';
  userInput.placeholder = "Listening...";
  
  const simulatedVoiceQueries = [
    "I need a wheelchair elevator near section 112",
    "Where is the sensory room located?",
    "Which gate has the shortest wait time right now?",
    "How do I catch the train to Penn Station?",
    "Show me the crowd density right now"
  ];
  
  const randomQuery = simulatedVoiceQueries[Math.floor(Math.random() * simulatedVoiceQueries.length)];
  
  setTimeout(() => {
    pulseEl.style.animation = '';
    pulseEl.style.opacity = '';
    iconEl.style.color = '';
    userInput.placeholder = "Ask about gate wait times, elevators, concessions, transit...";
    
    let charIndex = 0;
    userInput.value = '';
    
    function typeChar() {
      if (charIndex < randomQuery.length) {
        userInput.value += randomQuery.charAt(charIndex);
        charIndex++;
        setTimeout(typeChar, 40);
      }
    }
    
    typeChar();
  }, 2000);
}
