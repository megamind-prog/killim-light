// Embed page: pick the language from ?lang= before anything is drawn.
// ?lang=en|bi  ?region=efate|santo|tanna|all  ?lat=&lng=&zoom=  ?light=green
  (function () { var q = new URLSearchParams(location.search); var l = q.get('lang'); if (l === 'en' || l === 'bi') KLi18n.setLang(l, true); })();
