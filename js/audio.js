/* =========================================================================
   Audio via the Web Speech API.
   Croatian voices ship with some OSes/browsers (e.g. Microsoft Gabrijela on
   Windows 11, Google hrvatski in Chrome). We detect availability, expose a
   speak() helper, and let the UI mark which items are speakable.
   ========================================================================= */
(function () {
  'use strict';

  let voices = [];
  let hrVoice = null;
  let ready = false;
  const listeners = [];      // fired once, when first voice scan completes
  const changeListeners = []; // fired only when availability changes later

  function pickVoice() {
    if (!window.speechSynthesis) return;
    const hadVoice = !!hrVoice;
    voices = speechSynthesis.getVoices() || [];
    // Prefer exact hr-HR, then any hr, then Serbian/Bosnian as a near match
    // (close phonology — better than nothing, clearly labelled in settings).
    hrVoice =
      voices.find(v => /^hr(-|_)?HR/i.test(v.lang)) ||
      voices.find(v => /^hr/i.test(v.lang)) ||
      null;
    CRO.audio.nearVoice =
      hrVoice ? null :
      voices.find(v => /^(sr|bs)/i.test(v.lang) && /latn|latin/i.test(v.name + v.lang)) || null;
    const firstScan = !ready;
    ready = true;
    if (firstScan) listeners.splice(0).forEach(fn => fn());
    else if (!hadVoice && hrVoice) changeListeners.forEach(fn => fn());
  }

  function init() {
    if (!window.speechSynthesis) { ready = true; return; }
    pickVoice();
    // Voices often load async; Chrome fires voiceschanged.
    speechSynthesis.onvoiceschanged = pickVoice;
    // Safari/some browsers never fire the event — poll a few times.
    let tries = 0;
    const t = setInterval(() => {
      if (hrVoice || ++tries > 10) { clearInterval(t); return; }
      pickVoice();
    }, 400);
  }

  function available() { return !!hrVoice; }

  function onReady(fn) { ready ? fn() : listeners.push(fn); }
  function onChange(fn) { changeListeners.push(fn); }

  /** Speak Croatian text. rate ~0.85 for learners; 0.6 on replay = slow mode. */
  function speak(text, rate) {
    if (!window.speechSynthesis) return false;
    const v = hrVoice || CRO.audio.nearVoice;
    if (!v) return false;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.voice = v;
    u.lang = v.lang;
    u.rate = rate || 0.85;
    u.pitch = 1;
    speechSynthesis.speak(u);
    return true;
  }

  function voiceLabel() {
    if (hrVoice) return hrVoice.name + ' (' + hrVoice.lang + ')';
    if (CRO.audio.nearVoice) return CRO.audio.nearVoice.name + ' (' + CRO.audio.nearVoice.lang + ', near match)';
    return null;
  }

  window.CRO = window.CRO || {};
  CRO.audio = { init, speak, available, onReady, onChange, voiceLabel, nearVoice: null };
})();
