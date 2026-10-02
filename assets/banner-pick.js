/* ==========================================================
   トップのバナーをどちらにするか、開くたびにくじで決める
   flash   … 30秒の「ようこそ」（banner.js）
   bonfire … 焚き火版（banner-bonfire.js）
   ?banner=flash / ?banner=bonfire で固定できる
   ========================================================== */
(() => {
  const root = document.getElementById('welcome');
  if (!root) return;
  const ask = new URLSearchParams(location.search).get('banner');
  const pick = ask === 'flash' || ask === 'bonfire' ? ask : (Math.random() < .5 ? 'flash' : 'bonfire');
  root.dataset.banner = pick;
  if (pick !== 'bonfire') return;
  root.classList.add('is-bonfire');
  root.querySelector('.wb-play-label').textContent = '話を聞く';
  root.querySelector('.wb-cv').setAttribute('aria-label', '深夜の焚き火。ようこそお越しくださいました。ヒノガタリ／山賀秀明');
})();
