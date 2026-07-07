// Global State
let chatHistory = [];
let isAccessibilityActive = false;
let currentLanguage = 'en';

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

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
  // Initialize Lucide Icons
  lucide.createIcons();
  
  // Load Widget Data
  fetchStadiumData();
  
  // Setup Event Listeners
  chatForm.addEventListener('submit', handleChatSubmit);
  voiceBtn.addEventListener('click', handleVoiceClick);
  langSelector.addEventListener('change', handleLanguageChange);
  accessibilityToggle.addEventListener('click', handleAccessibilityToggle);
  
  // Event delegation for chips & accessibility action buttons
  document.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    const accChip = e.target.closest('.btn-acc-chip');
    
    if (chip) {
      const query = chip.getAttribute('data-query');
      submitQuery(query);
    } else if (accChip) {
      const query = accChip.getAttribute('data-query');
      submitQuery(query);
    }
  });

  // Run Premium GSAP Loading Animations
  runGSAPEntranceAnimations();
});

// GSAP Entrance Animations
function runGSAPEntranceAnimations() {
  if (typeof gsap === 'undefined') return;

  const tl = gsap.timeline();

  // Header slides down
  tl.from(".app-header", {
    y: -70,
    opacity: 0,
    duration: 0.8,
    ease: "power4.out"
  });

  // Sidebar header slides in from left
  tl.from(".live-status-header", {
    x: -30,
    opacity: 0,
    duration: 0.5,
    ease: "power2.out"
  }, "-=0.4");

  // Stadium Map pointers pop out in a bouncy way
  tl.from(".map-pointer", {
    scale: 0,
    opacity: 0,
    duration: 0.5,
    stagger: 0.08,
    ease: "back.out(1.8)"
  }, "-=0.3");

  // Main Chat container fades and rises up
  tl.from(".chat-container", {
    y: 35,
    opacity: 0,
    duration: 0.8,
    ease: "power3.out"
  }, "-=0.6");

  // Welcome message pops in
  tl.from(".bot-message", {
    scale: 0.95,
    opacity: 0,
    duration: 0.5,
    ease: "power2.out"
  }, "-=0.2");
}

// Fetch Real-time status data from server
async function fetchStadiumData() {
  try {
    const response = await fetch('/api/stadium-data');
    if (!response.ok) throw new Error('Network response not ok');
    
    const data = await response.json();
    renderTransportStatus(data.transport);
    renderConcessionStatus(data.concessions);
  } catch (error) {
    console.error('Error fetching stadium status data:', error);
    transportContainer.innerHTML = `<div class="status-card"><span class="card-title">Failed to load transport updates.</span></div>`;
    concessionContainer.innerHTML = `<div class="status-card"><span class="card-title">Failed to load concession times.</span></div>`;
  }
}

// Render Transportation Cards in Sidebar
function renderTransportStatus(transports) {
  transportContainer.innerHTML = '';
  transports.forEach(item => {
    let statusClass = 'green';
    if (item.status.toLowerCase().includes('delay')) statusClass = 'yellow';
    if (item.status.toLowerCase().includes('suspended')) statusClass = 'red';
    
    const card = document.createElement('div');
    card.className = 'status-card';
    card.innerHTML = `
      <div class="card-title-row">
        <span class="card-title">${item.type}</span>
        <span class="status-badge ${statusClass}">${item.status}</span>
      </div>
      <div class="card-detail">
        <span>Station: ${item.station}</span>
        <span>${item.frequency}</span>
      </div>
      <div class="card-subtext">${item.notes}</div>
    `;
    transportContainer.appendChild(card);
  });

  // Stagger animate cards on data reload
  if (typeof gsap !== 'undefined') {
    gsap.from(transportContainer.querySelectorAll('.status-card'), {
      opacity: 0,
      y: 10,
      stagger: 0.08,
      duration: 0.4,
      ease: "power1.out"
    });
  }
}

// Render Concessions Cards in Sidebar
function renderConcessionStatus(concessions) {
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

  // Stagger animate cards on data reload
  if (typeof gsap !== 'undefined') {
    gsap.from(concessionContainer.querySelectorAll('.status-card'), {
      opacity: 0,
      y: 10,
      stagger: 0.08,
      duration: 0.4,
      ease: "power1.out"
    });
  }
}

// Submit a custom query (from inputs or quick-chips)
function submitQuery(query) {
  userInput.value = query;
  handleChatSubmit(new Event('submit'));
}

// Handle Chat Message Submission
async function handleChatSubmit(e) {
  e.preventDefault();
  
  const text = userInput.value.trim();
  if (!text) return;
  
  // Clear input
  userInput.value = '';
  
  // Append User Message to UI
  appendMessage('user', text);
  
  // Scroll to bottom
  scrollToBottom();
  
  // Prepare payload with accessibility annotations if active
  let payloadText = text;
  if (isAccessibilityActive) {
    payloadText = `[User has Accessibility Mode Active - prioritize elevators, sensory rooms, ramps, and VIP Gate C entry] ${text}`;
  }
  if (currentLanguage !== 'en') {
    payloadText = `[User selected language: ${currentLanguage}. Respond in this language.] ${payloadText}`;
  }
  
  // Add to internal history
  chatHistory.push({ role: 'user', content: payloadText });
  
  // Add Typing Indicator
  const typingIndicator = appendTypingIndicator();
  scrollToBottom();
  
  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ messages: chatHistory })
    });
    
    // Remove Typing Indicator
    typingIndicator.remove();
    
    if (!response.ok) throw new Error('API Response was not ok');
    
    const data = await response.json();
    
    // Append Bot Message to UI
    appendMessage('bot', data.text);
    chatHistory.push({ role: 'model', content: data.text });
    
    // Reload live sensor data in background to keep widgets fresh
    fetchStadiumData();
    
  } catch (error) {
    console.error('Error during chat request:', error);
    typingIndicator.remove();
    appendMessage('bot', "I'm sorry, I'm having trouble connecting to the MetLife Stadium servers right now. Please check your internet connection and try again.");
  }
  
  scrollToBottom();
}

// Append Message Node to Chat Body
function appendMessage(sender, text) {
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${sender}-message`;
  
  const avatarHtml = sender === 'bot' 
    ? `<div class="message-avatar"><i data-lucide="compass" class="avatar-icon"></i></div>`
    : `<div class="message-avatar"><i data-lucide="user" class="avatar-icon"></i></div>`;
    
  const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  
  // Support simple markdown bold and bullet points in response text
  const formattedText = formatMarkdown(text);
  
  messageDiv.innerHTML = `
    ${avatarHtml}
    <div class="message-content">
      ${formattedText}
      <span class="message-time">${timestamp}</span>
    </div>
  `;
  
  chatBody.appendChild(messageDiv);
  
  // Initialize newly added icons
  lucide.createIcons();

  // Premium GSAP pop-in animation for message bubbles
  if (typeof gsap !== 'undefined') {
    gsap.fromTo(messageDiv, 
      { scale: 0.94, y: 15, opacity: 0 },
      { scale: 1, y: 0, opacity: 1, duration: 0.45, ease: "back.out(1.2)" }
    );
  }
}

// Add typing visual placeholder
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

// Scroll chat log body to the bottom
function scrollToBottom() {
  chatBody.scrollTop = chatBody.scrollHeight;
}

// Simple Markdown parser for bold, lists, and line breaks
function formatMarkdown(text) {
  let html = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  
  const lines = html.split('\n');
  let result = '';
  let inList = false;
  
  lines.forEach(line => {
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
      if (trimmedLine) {
        result += `<p>${trimmedLine}</p>`;
      }
    }
  });
  
  if (inList) {
    result += '</ul>';
  }
  
  return result || html;
}

// Handle Language selector changes
function handleLanguageChange(e) {
  currentLanguage = e.target.value;
  
  let notice = '';
  switch (currentLanguage) {
    case 'es':
      notice = "Idioma cambiado a Español. ¡MetLife Assist responderá en español!";
      break;
    case 'fr':
      notice = "Langue changée en Français. MetLife Assist répondra en français !";
      break;
    case 'de':
      notice = "Sprache auf Deutsch geändert. MetLife Assist wird auf Deutsch antworten!";
      break;
    case 'hi':
      notice = "भाषा बदलकर हिन्दी कर दी गई है। मेटलाइफ असिस्ट हिन्दी में जवाब देगा!";
      break;
    case 'ar':
      notice = "تم تغيير اللغة إلى العربية. ستجيب خدمة MetLife Assist باللغة العربية!";
      break;
    default:
      notice = "Language set to English. MetLife Assist will respond in English!";
  }
  
  appendMessage('bot', `🌐 **System Notice:** ${notice}`);
  scrollToBottom();
}

// Toggle Accessibility features
function handleAccessibilityToggle() {
  isAccessibilityActive = !isAccessibilityActive;
  
  if (isAccessibilityActive) {
    document.body.classList.add('accessibility-active');
    accessibilityToggle.classList.add('active');
    accessibilityPanel.classList.remove('hidden');
    accessibilityHeaderBanner.classList.remove('hidden');
    appendMessage('bot', "♿ **Accessibility Assist Active:** I will now prioritize step-free paths, escalators, elevators, wheelchair entries, and our sensory room near Section 212.");
    
    // Smooth fade in for panel
    if (typeof gsap !== 'undefined') {
      gsap.from(accessibilityPanel, {
        height: 0,
        opacity: 0,
        duration: 0.4,
        ease: "power2.out"
      });
    }
  } else {
    document.body.classList.remove('accessibility-active');
    accessibilityToggle.classList.remove('active');
    accessibilityPanel.classList.add('hidden');
    accessibilityHeaderBanner.classList.add('hidden');
    appendMessage('bot', "ℹ️ **Accessibility Assist Disabled:** Returned to standard navigation paths.");
  }
  scrollToBottom();
}

// Mock Voice Recording click
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
    "How do I catch the train to Penn Station?"
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
