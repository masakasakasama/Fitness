(function () {
  'use strict';

  function nativeAvailable() {
    return typeof window.RepsAndroid !== 'undefined';
  }

  function scheduleNativeRest(sec) {
    if (!nativeAvailable() || typeof window.RepsAndroid.scheduleRest !== 'function') return;
    try { window.RepsAndroid.scheduleRest(Math.max(1, Math.round(Number(sec) || 0))); } catch (_) {}
  }

  function cancelNativeRest() {
    if (!nativeAvailable() || typeof window.RepsAndroid.cancelRest !== 'function') return;
    try { window.RepsAndroid.cancelRest(); } catch (_) {}
  }

  if (typeof window.startRest === 'function') {
    const baseStartRest = window.startRest;
    window.startRest = function (sec) {
      const result = baseStartRest.apply(this, arguments);
      scheduleNativeRest(sec);
      return result;
    };
  }

  if (typeof window.stopRest === 'function') {
    const baseStopRest = window.stopRest;
    window.stopRest = function () {
      cancelNativeRest();
      return baseStopRest.apply(this, arguments);
    };
  }


  window.REPSNative = Object.freeze({
    available: nativeAvailable,
    scheduleRest: scheduleNativeRest,
    cancelRest: cancelNativeRest,
  });
})();