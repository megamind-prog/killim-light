// Links from login emails and Google come back to the home page: finish them on the owner page.
// Google can also send an error back in the address (?error=...): move it into the # part so the login page can show it.
if (/[?&]error=/.test(location.search) && !location.hash) history.replaceState(null, '', location.pathname + '#' + location.search.slice(1));
if (/(^|[#&])(confirmation_token|recovery_token|invite_token|email_change_token|access_token|error)=/.test(location.hash)) { let back = '/owner'; try { back = localStorage.getItem('kl-return') || back; localStorage.removeItem('kl-return'); } catch (e) {} location.replace((/^\/(owner|chief)/.test(back) ? back : '/owner') + location.hash); }
