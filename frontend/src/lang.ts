/**
 * Persian (Farsi) language strings for 8-Ball Pool
 */
export const LANG = {
  // Index / Loading
  title: 'بیلیارد ۸ توپ',
  loading: 'در حال بارگذاری بیلیارد ۸ توپ...',

  // BootScene
  bootTitle: '🎱 بیلیارد ۸ توپ',
  connecting: 'در حال اتصال...',
  connectionFailedRetry: 'خطا در اتصال. تلاش مجدد...',
  connectionFailedRefresh: 'خطا در اتصال. صفحه را تازه کنید',

  // WaitingScene
  waitingTitle: '🎱',
  waitingForOpponent: 'منتظر حریف...',
  opponentFound: (name: string) => `حریف پیدا شد: ${name}`,
  cancel: 'انصراف',

  // GameScene
  player1: 'بازیکن ۱',
  player2: 'بازیکن ۲',
  breakText: 'شکست!',
  yourTurn: 'نوبت شما',
  opponentTurn: 'نوبت حریف',
  aimAndShoot: 'هدف بگیر و شلیک کن!',
  shootHint: 'رها کن تا شلیک شود',
  waitingOpponent: 'منتظر حریف...',
  simulating: 'شبیه‌سازی...',
  waitingShotData: 'در حال دریافت ضربه حریف...',
  waitingServer: 'منتظر سرور...',
  shoot: 'شلیک',

  // Fouls
  foulScratch: 'خطا — توپ سفید افتاد! توپ دست',
  foulEarly8: 'خطا — زود توپ ۸ رو انداختی! باختی!',
  foulWrongFirst: 'خطا — اول باید توپ خودت رو بزنی',
  foulOpponentBall: 'خطا — توپ حریف رو انداختی',
  foulNoContact: 'خطا — توپ سفید به هیچ توپی نخورد',
  foulIllegalBreak: 'خطا — شکست غیرمجاز',
  foulEightOnBreak: 'توپ ۸ برگردانده شد — توپ دست',
  foulNoRail: 'خطا — توپ به دیوار نخورد',
  foul: (reason: string) => `خطا — ${reason}`,

  // Ball-in-hand
  ballInHand: 'توپ دست — جای توپ سفید رو انتخاب کن',
  yourGroup: (group: string) => `گروه تو: ${group === 'solids' ? 'توپ‌های ساده' : 'توپ‌های خط‌دار'}`,
  opponentGroup: (group: string) => `حریف: ${group === 'solids' ? 'توپ‌های ساده' : 'توپ‌های خط‌دار'}`,

  // ResultScene
  win: 'برنده شدی! 🏆',
  lose: 'باختی 😔',
  youWon: '🎉 برنده شدی!',
  youLost: '💔 باختی!',
  playerWon: (name: string) => `${name} برنده شد`,
  pocketed8: 'توپ ۸ را انداخت!',
  early8Ball: 'حریف زود توپ ۸ را انداخت',
  opponentDisconnected: 'حریف از بازی خارج شد',
  gameEnded: 'بازی تمام شد',
  playAgain: 'بازی دوباره',
  backToLobby: 'بازگشت',

  // Orientation overlay
  rotateDevice: 'لطفاً دستگاه را بچرخانید',
  landscapeMode: 'حالت افقی برای تجربه بهتر',

  // Opponent names in Persian
  opponentNames: [
    'آریا', 'بابک', 'کوروش', 'دارا', 'احسان',
    'فرهاد', 'گودرز', 'هرمز', 'ایرج', 'جمشید',
    'کاوه', 'لهراسب', 'مانی', 'نوید', 'امید',
    'پارسا', 'رستم', 'سهراب', 'تهمورس', 'زرتشت',
  ],
} as const;
