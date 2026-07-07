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
const srAnnouncer = document.getElementById('srAnnouncer');

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

  // Keyboard accessibility
  userInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      userInput.value = '';
      announceToScreenReader('Input cleared');
    }
  });

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
// SCREEN READER ANNOUNCER
// ============================================================
/**
 * Announces a message to the screen reader using an aria-live region.
 * @param {string} message - The message to announce.
 */
function announceToScreenReader(message) {
  if (srAnnouncer) {
    srAnnouncer.textContent = message;
    // Clear after a bit so repeating same message works
    setTimeout(() => {
      srAnnouncer.textContent = '';
    }, 3000);
  }
}

// ============================================================
// GSAP ENTRANCE ANIMATIONS
// ============================================================
/**
 * Initializes and plays the GSAP entrance animations for the application layout.
 */
function runGSAPEntranceAnimations() {
  if (typeof gsap === 'undefined') return;

  const tl = gsap.timeline();

  tl.from('.app-header', {
    y: -70,
    opacity: 0,
    duration: 0.8,
    ease: 'power4.out',
  });

  tl.from(
    '.live-status-header',
    {
      x: -30,
      opacity: 0,
      duration: 0.5,
      ease: 'power2.out',
    },
    '-=0.4'
  );

  tl.fromTo(
    '.sidebar-widget',
    { y: 20, opacity: 0 },
    { y: 0, opacity: 1, duration: 0.5, stagger: 0.1, ease: 'power2.out' },
    '-=0.3'
  );

  tl.from(
    '.chat-container',
    {
      y: 35,
      opacity: 0,
      duration: 0.8,
      ease: 'power3.out',
    },
    '-=0.5'
  );

  tl.from(
    '.bot-message',
    {
      scale: 0.95,
      opacity: 0,
      duration: 0.5,
      ease: 'power2.out',
    },
    '-=0.2'
  );
}

// ============================================================
// MATCH COUNTDOWN TIMER
// ============================================================
/**
 * Starts the countdown timer for the upcoming match.
 */
function startMatchCountdown() {
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

      if (typeof gsap !== 'undefined') {
        gsap.to(matchTimer, {
          scale: 1.05,
          duration: 0.5,
          yoyo: true,
          repeat: -1,
          ease: 'power1.inOut',
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

    if (typeof gsap !== 'undefined') {
      gsap.fromTo(cdSeconds, { scale: 1.1 }, { scale: 1, duration: 0.3, ease: 'power1.out' });
    }
  }, 1000);
}

// ============================================================
// CROWD DENSITY HEATMAP COLORS
// ============================================================
/**
 * Initializes the colors and fluctuations for the crowd density heatmap widget.
 */
function initHeatmapColors() {
  const zones = document.querySelectorAll('.heatmap-zone[data-density]');
  zones.forEach((zone) => {
    const density = parseInt(zone.getAttribute('data-density'));
    if (density === 0) return;

    const opacity = Math.max(0.05, (density / 100) * 0.7);
    zone.style.background = `rgba(255, 255, 255, ${opacity})`;

    const pctEl = zone.querySelector('.zone-pct');
    if (pctEl) {
      if (density >= 80) pctEl.style.color = '#f87171';
      else if (density >= 60) pctEl.style.color = '#fbbf24';
      else pctEl.style.color = '#d4d4d4';
    }
  });

  setInterval(() => {
    zones.forEach((zone) => {
      const baseDensity = parseInt(zone.getAttribute('data-density'));
      if (baseDensity === 0) return;

      const fluctuation = Math.floor(Math.random() * 11) - 5;
      const newDensity = Math.max(10, Math.min(99, baseDensity + fluctuation));

      const opacity = Math.max(0.05, (newDensity / 100) * 0.7);
      const pctEl = zone.querySelector('.zone-pct');
      if (pctEl) {
        pctEl.textContent = `${newDensity}%`;
        if (newDensity >= 80) pctEl.style.color = '#f87171';
        else if (newDensity >= 60) pctEl.style.color = '#fbbf24';
        else pctEl.style.color = '#d4d4d4';
      }

      if (typeof gsap !== 'undefined') {
        gsap.to(zone, {
          background: `rgba(255, 255, 255, ${opacity})`,
          duration: 1,
          ease: 'power1.inOut',
        });
      } else {
        zone.style.background = `rgba(255, 255, 255, ${opacity})`;
      }
    });
  }, 8000);
}

// ============================================================
// EMERGENCY ALERT SYSTEM
// ============================================================
/**
 * Toggles the emergency mode alert system.
 */
function handleEmergencyToggle() {
  isEmergencyActive = !isEmergencyActive;

  if (isEmergencyActive) {
    emergencyToggle.classList.add('active');
    emergencyBanner.classList.remove('hidden');
    document.body.style.borderTop = '3px solid #ef4444';
    announceToScreenReader('Emergency mode activated. Evacuation information displayed.');

    if (typeof gsap !== 'undefined') {
      gsap.from(emergencyBanner, { height: 0, opacity: 0, duration: 0.4, ease: 'power2.out' });
    }

    appendMessage('bot', null, {
      type: 'alert',
      title: '⚠️ Emergency Mode Activated',
      body: '**Emergency evacuation protocols are now displayed.** Follow illuminated exits and stadium staff directions.\n\n- **Gate C (East):** Accessible emergency exit\n- **Medical Stations:** Sections 110, 215, 318\n- **Security Hotline:** Extension 911 on courtesy phones',
      cards: [
        { label: 'Nearest Exit', value: 'Gate C (East)', status: 'critical' },
        { label: 'Medical Station', value: 'Sections 110, 215, 318', status: 'warning' },
      ],
      tip: 'If this is a life-threatening emergency, call 911 immediately.',
    });
  } else {
    emergencyToggle.classList.remove('active');
    emergencyBanner.classList.add('hidden');
    document.body.style.borderTop = 'none';
    announceToScreenReader('Emergency mode deactivated.');
    appendMessage('bot', null, {
      type: 'standard',
      title: null,
      body: 'ℹ️ **Emergency mode deactivated.** Returning to normal operations.',
      cards: [],
      tip: null,
    });
  }
  scrollToBottom();
}

// ============================================================
// FETCH STADIUM DATA FOR SIDEBAR WIDGETS
// ============================================================
/**
 * Fetches real-time stadium data from the API and renders it in the sidebar.
 * @returns {Promise<void>}
 */
async function fetchStadiumData() {
  try {
    const response = await fetch('/api/stadium-data');
    if (!response.ok) throw new Error('Network response not ok');

    const data = await response.json();
    renderTransportStatus(data.transport);
    renderConcessionStatus(data.concessions);
  } catch (error) {
    console.error('Error fetching stadium status data:', error);
    renderTransportStatus([
      {
        type: 'NJ Transit Rail',
        station: 'Lot B Station',
        status: 'On Time',
        frequency: 'Every 10 min',
        notes: 'Direct to NYC Penn Station',
      },
      {
        type: 'Coach USA Bus',
        station: 'Lot A Terminal',
        status: 'Minor Delays',
        frequency: 'Every 15 min',
        notes: 'Route 3 traffic',
      },
      {
        type: 'Rideshare (Uber/Lyft)',
        station: 'Lot E',
        status: 'High Demand',
        frequency: '20-25 min wait',
        notes: 'Surge pricing active',
      },
    ]);
    renderConcessionStatus([
      {
        section: '112',
        name: 'Goalpost Tacos',
        level: 'Lower Bowl',
        waitTimeMinutes: 12,
        popularItem: 'Carne Asada Nachos',
      },
      {
        section: '224',
        name: 'Champions Club Burgers',
        level: 'Club Level',
        waitTimeMinutes: 5,
        popularItem: 'Trophy Cheeseburger',
      },
      {
        section: '318',
        name: 'Strikers Hot Dogs',
        level: 'Upper Bowl',
        waitTimeMinutes: 20,
        popularItem: 'Footlong Jersey Dog',
      },
    ]);
  }
}

/**
 * Renders the transportation status widget with colored badges.
 * @param {Array<Object>} transports - The array of transport data objects.
 */
function renderTransportStatus(transports) {
  if (!transportContainer) return;
  transportContainer.innerHTML = '';
  transports.forEach((item) => {
    let statusClass = 'green';
    if (item.status.toLowerCase().includes('delay')) statusClass = 'yellow';
    if (
      item.status.toLowerCase().includes('suspended') ||
      item.status.toLowerCase().includes('high')
    )
      statusClass = 'red';

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
}

/**
 * Renders the concession wait times widget.
 * @param {Array<Object>} concessions - The array of concession data objects.
 */
function renderConcessionStatus(concessions) {
  if (!concessionContainer) return;
  concessionContainer.innerHTML = '';
  concessions.forEach((item) => {
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
}

// ============================================================
// CHAT SUBMISSION & SSE STREAMING
// ============================================================
/**
 * Submits a query directly to the chat interface.
 * @param {string} query - The search query to submit.
 */
function submitQuery(query) {
  userInput.value = query;
  handleChatSubmit(new Event('submit'));
}

/**
 * Handles the form submission for the chat interface, sending the message to the AI.
 * @param {Event} e - The submit event.
 * @returns {Promise<void>}
 */
async function handleChatSubmit(e) {
  e.preventDefault();

  const text = userInput.value.trim();
  if (!text) return;

  userInput.value = '';
  appendMessage('user', text);
  scrollToBottom();

  let payloadText = text;
  if (isAccessibilityActive) {
    payloadText = `[User has Accessibility Mode Active - prioritize elevators, sensory rooms, ramps, and VIP Gate C entry] ${text}`;
  }
  if (currentLanguage !== 'en') {
    payloadText = `[User selected language: ${currentLanguage}. Respond in this language.] ${payloadText}`;
  }

  chatHistory.push({ role: 'user', content: payloadText });

  // Create a message bubble for streaming response
  const botMessageEl = createMessageContainer('bot');
  const contentEl = botMessageEl.querySelector('.message-content-inner');
  const cursorEl = document.createElement('span');
  cursorEl.className = 'typing-cursor';
  contentEl.appendChild(cursorEl);

  scrollToBottom();
  announceToScreenReader('MetLife Assist is typing...');

  try {
    const response = await fetch('/api/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: chatHistory }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        const data = await response.json();
        cursorEl.remove();
        if (data.text) {
          const structured = JSON.parse(data.text);
          contentEl.innerHTML = renderStructuredContent(structured);
          announceToScreenReader('Rate limit exceeded.');
        }
        return;
      }
      throw new Error('API Response was not ok');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let done = false;
    let fullText = '';
    let buffer = '';

    while (!done) {
      const { value, done: readerDone } = await reader.read();
      done = readerDone;
      if (value) {
        buffer += decoder.decode(value, { stream: true });

        // Process all complete lines in the buffer
        let newlineIndex;
        while ((newlineIndex = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, newlineIndex).trim();
          buffer = buffer.slice(newlineIndex + 1);

          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));

              if (data.token) {
                fullText += data.token;
                cursorEl.remove();
                contentEl.innerHTML =
                  formatMarkdown(fullText) + '<span class="typing-cursor"></span>';
                scrollToBottom();
              }

              if (data.done) {
                cursorEl.remove();

                // If language was detected and changed, update dropdown quietly
                if (data.detectedLang && data.detectedLang !== currentLanguage) {
                  currentLanguage = data.detectedLang;
                  langSelector.value = currentLanguage;
                }

                if (data.structured) {
                  contentEl.innerHTML = renderStructuredContent(data.structured);
                  if (data.structured.type)
                    botMessageEl.classList.add(`response-${data.structured.type}`);
                  chatHistory.push({ role: 'model', content: data.structured.body || fullText });
                  announceToScreenReader('Message received.');
                } else {
                  contentEl.innerHTML = formatMarkdown(fullText);
                  chatHistory.push({ role: 'model', content: fullText });
                  announceToScreenReader('Message received.');
                }
                fetchStadiumData();
              }
            } catch (err) {
              console.error('Error parsing SSE data:', err, line);
            }
          }
        }
      }
    }
  } catch (error) {
    console.error('Error during chat request:', error);
    cursorEl.remove();
    contentEl.innerHTML = renderStructuredContent({
      type: 'alert',
      title: 'Connection Error',
      body: "I'm having trouble connecting to the MetLife Stadium servers. Please check your connection and try again.",
      cards: [],
      tip: null,
    });
    announceToScreenReader('Connection Error');
  }

  scrollToBottom();
}

// ============================================================
// MESSAGE RENDERING
// ============================================================
/**
 * Creates and appends a new message container to the chat body.
 * @param {string} sender - The sender ('bot' or 'user').
 * @returns {HTMLElement} The created message container element.
 */
function createMessageContainer(sender) {
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${sender}-message`;
  messageDiv.style.opacity = 1;

  const avatarHtml =
    sender === 'bot'
      ? `<div class="message-avatar"><i data-lucide="compass" class="avatar-icon"></i></div>`
      : `<div class="message-avatar"><i data-lucide="user" class="avatar-icon"></i></div>`;

  const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  messageDiv.innerHTML = `
    ${avatarHtml}
    <div class="message-content">
      <div class="message-content-inner"></div>
      <span class="message-time">${timestamp}</span>
    </div>
  `;

  chatBody.appendChild(messageDiv);
  lucide.createIcons();

  if (typeof gsap !== 'undefined') {
    gsap.fromTo(
      messageDiv,
      { scale: 0.94, y: 15, opacity: 0 },
      { scale: 1, y: 0, opacity: 1, duration: 0.45, ease: 'back.out(1.2)' }
    );
  }
  return messageDiv;
}

function appendMessage(sender, text, structured = null) {
  const messageDiv = createMessageContainer(sender);
  const contentEl = messageDiv.querySelector('.message-content-inner');

  if (structured && structured.type) {
    messageDiv.classList.add(`response-${structured.type}`);
  }

  if (structured && sender === 'bot') {
    contentEl.innerHTML = renderStructuredContent(structured);
  } else if (text) {
    contentEl.innerHTML = formatMarkdown(text);
  }
}

/**
 * Renders structured JSON data into HTML cards and tips.
 * @param {Object} data - The structured JSON response from the AI.
 * @returns {string} The formatted HTML string.
 */
function renderStructuredContent(data) {
  let html = '';
  if (data.title) html += `<div class="response-title">${data.title}</div>`;
  if (data.body) html += formatMarkdown(data.body);

  if (data.cards && data.cards.length > 0) {
    html += '<div class="response-cards">';
    data.cards.forEach((card) => {
      const statusClass =
        card.status === 'good'
          ? 'rc-good'
          : card.status === 'warning'
            ? 'rc-warning'
            : card.status === 'critical'
              ? 'rc-critical'
              : '';
      html += `
        <div class="response-card ${statusClass}">
          <span class="rc-label">${card.label}</span>
          <span class="rc-value">${card.value}</span>
        </div>
      `;
    });
    html += '</div>';
  }

  if (data.tip) html += `<div class="response-tip">${data.tip}</div>`;
  return html;
}

function scrollToBottom() {
  chatBody.scrollTop = chatBody.scrollHeight;
}

// ============================================================
// MARKDOWN PARSER
// ============================================================
/**
 * Converts simple markdown (bold and bullet points) to HTML.
 * @param {string} text - The markdown text.
 * @returns {string} The parsed HTML string.
 */
function formatMarkdown(text) {
  let html = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

  const lines = html.split('\n');
  let result = '';
  let inList = false;

  lines.forEach((line) => {
    const trimmedLine = line.trim();

    if (trimmedLine.startsWith('- ') || trimmedLine.startsWith('* ')) {
      if (!inList) {
        result += '<ul>';
        inList = true;
      }
      result += `<li>${trimmedLine.substring(2)}</li>`;
    } else {
      if (inList) {
        result += '</ul>';
        inList = false;
      }
      if (trimmedLine) result += `<p>${trimmedLine}</p>`;
    }
  });

  if (inList) result += '</ul>';
  return result || html;
}

// ============================================================
// LANGUAGE SELECTOR
// ============================================================
/**
 * Handles the language selector change event and notifies the system.
 * @param {Event} e - The change event from the selector.
 */
function handleLanguageChange(e) {
  currentLanguage = e.target.value;

  const notices = {
    es: 'Idioma cambiado a Español. ¡MetLife Assist responderá en español!',
    fr: 'Langue changée en Français. MetLife Assist répondra en français !',
    de: 'Sprache auf Deutsch geändert. MetLife Assist wird auf Deutsch antworten!',
    hi: 'भाषा बदलकर हिन्दी कर दी गई है। मेटलाइफ असिस्ट हिन्दी में जवाब देगा!',
    ar: 'تم تغيير اللغة إلى العربية. ستجيب خدمة MetLife Assist باللغة العربية!',
    pt: 'Idioma alterado para Português. O MetLife Assist responderá em português!',
    ja: '言語を日本語に変更しました。MetLife Assistは日本語で応答します！',
    en: 'Language set to English. MetLife Assist will respond in English!',
  };

  appendMessage('bot', null, {
    type: 'standard',
    title: null,
    body: `🌐 **System Notice:** ${notices[currentLanguage] || notices['en']}`,
    cards: [],
    tip: null,
  });
  scrollToBottom();
}

// ============================================================
// ACCESSIBILITY TOGGLE
// ============================================================
/**
 * Toggles the high-contrast/accessible routing mode for the application.
 */
function handleAccessibilityToggle() {
  isAccessibilityActive = !isAccessibilityActive;

  if (isAccessibilityActive) {
    document.body.classList.add('accessibility-active');
    accessibilityToggle.classList.add('active');
    accessibilityPanel.classList.remove('hidden');
    accessibilityHeaderBanner.classList.remove('hidden');

    announceToScreenReader('Accessibility Mode Active. Accessible routes will be prioritized.');
    appendMessage('bot', null, {
      type: 'navigation',
      title: '♿ Accessibility Assist Active',
      body: 'I will now prioritize step-free paths, escalators, elevators, wheelchair entries, and our sensory room near Section 212.',
      cards: [
        { label: 'Gate C (Accessible Entry)', value: '5 min wait — Low Traffic', status: 'good' },
        { label: 'Sensory Room', value: 'Section 212 — Club Level', status: 'good' },
      ],
      tip: 'Ask me about any section for personalized accessible route guidance.',
    });

    if (typeof gsap !== 'undefined') {
      gsap.from(accessibilityPanel, { height: 0, opacity: 0, duration: 0.4, ease: 'power2.out' });
    }
  } else {
    document.body.classList.remove('accessibility-active');
    accessibilityToggle.classList.remove('active');
    accessibilityPanel.classList.add('hidden');
    accessibilityHeaderBanner.classList.add('hidden');

    announceToScreenReader('Accessibility Mode Disabled.');
    appendMessage('bot', null, {
      type: 'standard',
      title: null,
      body: 'ℹ️ **Accessibility Assist Disabled:** Returned to standard navigation paths.',
      cards: [],
      tip: null,
    });
  }
  scrollToBottom();
}

// ============================================================
// MOCK VOICE INPUT
// ============================================================
/**
 * Simulates a voice input action for demonstration purposes.
 */
function handleVoiceClick() {
  const pulseEl = voiceBtn.querySelector('.mic-pulse');
  const iconEl = voiceBtn.querySelector('.mic-icon');

  pulseEl.style.animation = 'pulse-white-glow 1.8s infinite';
  pulseEl.style.opacity = '1';
  iconEl.style.color = 'var(--accent-white)';
  userInput.placeholder = 'Listening...';

  const simulatedVoiceQueries = [
    'I need a wheelchair elevator near section 112',
    'Where is the sensory room located?',
    'Which gate has the shortest wait time right now?',
    'How do I catch the train to Penn Station?',
    'Show me the crowd density right now',
  ];

  const randomQuery =
    simulatedVoiceQueries[Math.floor(Math.random() * simulatedVoiceQueries.length)];

  setTimeout(() => {
    pulseEl.style.animation = '';
    pulseEl.style.opacity = '';
    iconEl.style.color = '';
    userInput.placeholder = 'Ask about gate wait times, elevators, concessions, transit...';

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
