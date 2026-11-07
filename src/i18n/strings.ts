/* eslint-disable max-len */
// All app text in 3 languages. Pashto (ps) is the source; every key must exist in ps.
// {name} placeholders are filled by t('key', { name: 'value' }).

export const ps = {
  // common
  next: 'مخته', back: 'شاته', save: 'خوندي کول', cancel: 'لغوه', close: 'بندول', yes: 'هو', no: 'نه',
  delete: 'ړنګول', done: 'شو', send: 'لېږل', retry: 'بیا هڅه', create: 'جوړول', copy: 'کاپي',

  // auth
  welcome_title: 'Faisal Show ته ښه راغلاست', welcome_sub: 'د ملګرو سره پوسټونه، ریلز او چټ — په خپله ژبه',
  signup_btn: 'نوی حساب جوړ کړئ (Sign up)', login_btn: 'ننوتل (Login)', login_title: 'ننوتل',
  email: 'ایمیل', password: 'پاسورډ', password_again: 'پاسورډ بیا ولیکئ',
  forgot_q: 'پاسورډ مو هېر دی؟', no_account: 'حساب نه لرئ؟ Sign up', have_account: 'حساب لرئ؟ Login',
  new_account: 'نوی حساب', real_name_hint: 'خپل ریښتینی نوم ولیکئ', first_name: 'نوم', last_name: 'تخلص',
  gender: 'جنسیت', male: 'نارینه', female: 'ښځینه', birthday: 'د زېږېدو نېټه', day: 'ورځ', month: 'میاشت', year: 'کال',
  email_password_title: 'ایمیل او پاسورډ', email_password_sub: 'دا ایمیل او پاسورډ به د Faisal Show لپاره وي',
  send_code: 'کوډ ولېږئ', verify_title: 'ایمیل تایید کړئ', code: 'کوډ',
  code_sent: 'موږ ۵ عددي کوډ دې ایمیل ته ولېږه:', check_spam: 'که نه وي راغلی، Spam هم وګورئ.',
  resend: 'کوډ بیا ولېږئ', resend_in: 'کوډ بیا ولېږئ ({n})', verify_create: 'تایید او حساب جوړول',
  change_email_btn: 'ایمیل بدلول', forgot_title: 'پاسورډ مو هېر دی؟', forgot_sub: 'خپل ایمیل ولیکئ، موږ به تاسو ته کوډ درولېږو',
  new_password: 'نوی پاسورډ', new_password_again: 'نوی پاسورډ بیا ولیکئ', change_password_btn: 'پاسورډ بدل کړئ',
  enter_email_password: 'ایمیل او پاسورډ ولیکئ',

  // validation
  v_password: 'پاسورډ باید لږ تر لږه ۸ توري ولري: توري، شمېره او یو سمبول (لکه fai123@afg)',
  v_name_required: 'نوم او تخلص دواړه ولیکئ', v_name_long: 'نوم ډېر اوږد دی', v_name_chars: 'په نوم کې شمېرې او سمبولونه نه منل کېږي',
  v_gender: 'جنسیت وټاکئ', v_birthday: 'د زېږېدو نېټه سمه ولیکئ (ورځ / میاشت / کال)', v_too_young: 'د حساب جوړولو لپاره باید لږ تر لږه ۱۳ کلن یاست',
  v_year: 'د زېږېدو کال سم نه دی', v_email: 'ایمیل سم ولیکئ، لکه name@fainet.org', v_passwords_match: 'دواړه پاسورډونه یو شان نه دي',
  v_code5: '۵ عددي کوډ ولیکئ', v_username_len: 'ID Name باید له ۳ تر ۲۰ تورو پورې وي',
  v_username_chars: 'یوازې انګلیسي توري، شمېرې، ټکی (.) او _ منل کېږي', v_username_dot: 'ټکی (.) په پیل، پای یا دوه ځله پرله‌پسې نه راځي',
  v_username_reserved: 'دا نوم ساتل شوی دی',

  // setup
  photo_title: 'خپل عکس واچوئ', photo_sub: 'خلک به تاسو په دې عکس وپېژني', choose_photo: 'عکس غوره کړئ',
  save_next: 'خوندي کول او مخته', other_photo: 'بل عکس', not_now: 'اوس نه', photos_permission: 'د عکسونو اجازه ورکړئ',
  username_title: 'خپل ID Name وټاکئ', username_sub: 'دا ستاسو یوازینی نوم دی. خلک به تاسو پرې لټوي',
  bio_optional: 'بایو (اختیاري)', bio_placeholder: 'د خپل ځان په اړه یوه کرښه...', start: 'پیل کړئ',

  // errors
  e_invalid_code: 'کوډ غلط دی. {n} هڅې پاتې دي', e_invalid_code_plain: 'کوډ غلط دی', e_code_expired: 'کوډ ختم شوی. نوی کوډ وغواړئ',
  e_too_many: 'ډېرې غلطې هڅې وشوې. نوی کوډ وغواړئ', e_wait: 'لطفاً {n} ثانیې صبر وکړئ', e_rate: 'ډېرې هڅې وشوې. لږ وروسته بیا هڅه وکړئ',
  e_email_in_use: 'دا ایمیل مخکې ثبت شوی', e_weak_password: 'پاسورډ کمزوری دی', e_username_taken: 'دا ID Name بل چا اخیستی',
  e_username_invalid: 'ID Name سم نه دی', e_invalid_credentials: 'ایمیل یا پاسورډ غلط دی', e_disabled: 'دا حساب بند شوی',
  e_image_big: 'فایل ډېر لوی دی', e_upload: 'فایل پورته نه شو. بیا هڅه وکړئ', e_email_send: 'ایمیل ونه لېږل شو. بیا هڅه وکړئ',
  e_invalid_input: 'معلومات سم نه دي', e_relogin: 'بیا Login وکړئ', e_network: 'سرور ته نه رسېږو. انټرنېټ وګورئ او بیا هڅه وکړئ',
  e_generic: 'یوه ستونزه پېښه شوه. بیا هڅه وکړئ', e_video_long: 'ویډیو باید تر ۶۰ ثانیو لنډه وي', e_video_big: 'ویډیو باید تر 25MB کمه وي',
  e_already_opened: 'دا پیغام مخکې خلاص شوی', e_forbidden: 'اجازه نشته',

  // tabs
  tab_home: 'Home', tab_reels: 'Reels', tab_noti: 'Notifications', tab_profile: 'Profile',

  // feed / posts
  for_you: 'For You', following: 'Following', empty_following: 'تاسو لا هېچا ته Follow نه دی کړی.\nد لټون 🔍 له لارې خلک ومومئ.',
  empty_feed: 'تر اوسه هېڅ پوسټ نشته. لومړی پوسټ تاسو واچوئ!', no_posts: 'تر اوسه هېڅ پوسټ نشته', featured: 'ځانګړی',
  comment: 'کمنټ', share: 'شریکول', save_post: 'سېو', comments_n: '{n} کمنټ', shares_n: '{n} شریک',
  delete_post: 'پوسټ ړنګول', delete_post_q: 'ړنګول؟', delete_forever: 'دا به د تل لپاره ړنګ شي', yes_delete: 'هو، ړنګ یې کړه',
  report: 'راپور ورکول (Report)', report_thanks: 'مننه. راپور مو ورسېد.', post_missing: 'دا پوسټ نشته یا ړنګ شوی',
  first_comment: 'لومړی کمنټ تاسو ولیکئ', write_comment: 'کمنټ ولیکئ... (@name)', delete_comment_q: 'کمنټ ړنګول؟',
  post_title: 'پوسټ', new_post: 'نوی پوسټ', whats_on_mind: 'څه فکر کوئ؟', photo: 'عکس', video: 'ویډیو', location: 'ځای',
  feeling: 'احساس', feeling_title: 'څنګه احساس کوئ؟', is_feeling: 'احساس: {f}', at_location: '📍 {l}', location_permission: 'د ځای اجازه ورکړئ',
  locating: 'ځای پیدا کېږي...', time_now: 'همدا اوس', time_min: '{n} دقیقې مخکې', time_hour: '{n} ساعته مخکې', time_day: '{n} ورځې مخکې',
  no_reels: 'تر اوسه هېڅ ریل نشته. لومړۍ ویډیو تاسو واچوئ!',

  // profile
  posts: 'پوسټونه', saved: 'سېو شوي', empty_saved: 'تر اوسه مو هېڅ پوسټ نه دی سېو کړی', empty_my_posts: 'تر اوسه مو هېڅ پوسټ نه دی اچولی',
  new_post_btn: 'نوی پوسټ +', follow: 'Follow', following_btn: 'Following ✓', follow_back: 'Follow Back', profile_title: 'پروفایل',
  message_btn: 'پیغام', logout: 'وتل (Logout)',

  // search
  search_title: 'لټون', search_placeholder: 'نوم یا @ID Name ولټوئ', nobody_found: 'هېڅوک ونه موندل شو', find_people: 'ملګري او نوي خلک ومومئ',
  followers: 'Followers',

  // notifications
  n_like: 'ستاسو پوسټ یې Like کړ', n_comment: 'ستاسو پوسټ ته یې کمنټ وکړ', n_mention: 'تاسو یې په کمنټ کې یاد کړئ', n_follow: 'تاسو یې Follow کړئ',
  no_notifications: 'تر اوسه هېڅ خبرتیا نشته',

  // settings
  settings: 'تنظیمات', language: 'ژبه', personalize: 'شخصي معلومات', privacy_policy: 'د محرمیت پالیسي', about: 'زموږ په اړه',
  logout_q: 'له حساب څخه وځئ؟', delete_account: 'حساب ړنګول', delete_account_warn: 'ستاسو حساب، پوسټونه، کمنټونه او عکسونه به د تل لپاره ړنګ شي. دا کار بېرته نه راګرځي.',
  enter_password: 'د تایید لپاره خپل پاسورډ ولیکئ', lang_title: 'ژبه وټاکئ', lang_more: 'نوې ژبه نصبول', lang_more_sub: 'نورې ژبې ژر راځي: اردو، عربي، ترکي...',
  lang_installed: 'نصب شوې', edit_profile: 'نوم او بایو', change_photo: 'عکس بدلول', change_email: 'ایمیل بدلول', change_password: 'پاسورډ بدلول',
  current_password: 'اوسنی پاسورډ', saved_ok: 'خوندي شو ✓', current_email: 'اوسنی ایمیل: {e}', new_email: 'نوی ایمیل',
  email_change_sub: 'نوي ایمیل ته به ۵ عددي کوډ ولېږل شي. ✓ نښه یوازې د @fainet.org ایمیلونو ته ورکول کېږي.',
  password_changed: 'پاسورډ بدل شو ✓', email_changed: 'ایمیل بدل شو ✓', version: 'نسخه {v}', account: 'حساب', app: 'اپ',
  verified_info: '✓ Verified نښه یوازې هغو حسابونو ته ورکول کېږي چې ایمیل یې @fainet.org وي.',
  policy_text:
    'Faisal Show ستاسو محرمیت ته درناوی کوي.\n\n• څه راټولوو: ستاسو نوم، ایمیل، د زېږېدو نېټه، جنسیت، عکس، پوسټونه، کمنټونه، پیغامونه او هغه ځای چې پخپله یې په پوسټ کې اچوئ.\n\n• ولې: د حساب جوړولو، د پوسټونو او پیغامونو ښودلو، او د اپ د امنیت لپاره.\n\n• څوک یې ګوري: ستاسو ایمیل او د زېږېدو نېټه یوازې تاسو ته ښکاري. پوسټونه او پروفایل نورو کاروونکو ته ښکاري. پیغامونه یوازې د چټ غړو ته ښکاري.\n\n• موږ ستاسو معلومات نه پلورو او اعلاناتو ته یې نه ورکوو.\n\n• ستاسو اختیار: هر وخت خپل معلومات بدلولای شئ، او له تنظیماتو څخه خپل حساب د تل لپاره ړنګولای شئ.\n\n• امنیت: پاسورډونه پټ (hash) ساتل کېږي، او هر پیغام او فایل یوازې خپلو خاوندانو ته د لاسرسي وړ دی.\n\nد پوښتنو لپاره: support@fainet.org',
  about_text:
    'Faisal Show یو ټولنیز اپ دی چې د افغانانو لپاره جوړ شوی: پوسټونه، ریلز، چټ او خبرتیاوې — په پښتو، دري او انګلیسي.\n\nجوړونکی: Faisal Hadawal\nویب: fainet.org',

  // chats
  chats: 'چټونه', archived: 'Archive شوي', new_message: 'نوی پیغام', new_group: 'نوی ګروپ', group_name: 'د ګروپ نوم',
  choose_members: 'غړي وټاکئ', no_chats: 'تر اوسه هېڅ چټ نشته.\nد ✏️ تڼۍ په واسطه نوی پیغام پیل کړئ.', type_message: 'پیغام ولیکئ...',
  view_once: 'یو ځل لیدل', view_once_on: 'یو ځل لیدونکی پیغام: فعال 🔒', view_once_tap: '🔒 د لیدو لپاره ټچ کړئ (یوازې یو ځل)',
  view_once_sent: '🔒 یو ځل لیدونکی پیغام', opened: 'خلاص شو', deleted_msg: '🚫 دا پیغام ړنګ شوی', reply: 'ځواب',
  delete_for_everyone: 'د ټولو لپاره ړنګول', archive: 'Archive', unarchive: 'له Archive څخه ایستل', leave_group: 'له ګروپ وتل',
  you: 'تاسو', members_n: '{n} غړي', add_members: 'غړي ورزیاتول', start_chat_hint: 'نوم یا @ID ولټوئ', replying_to: '{name} ته ځواب',
  once_closes: 'دا پیغام به بند شي او بیا به نه خلاصېږي', group_created_by_you: 'ګروپ جوړ شو', online_now: 'Faisal Show',
  f_happy: 'خوشحاله', f_loved: 'مینه ناک', f_sad: 'خفه', f_cool: 'ښه', f_thinking: 'په فکر کې', f_tired: 'ستړی', f_party: 'خوشالي لمانځم', f_thankful: 'شکرګذار', f_angry: 'په غوسه', f_sick: 'ناروغ',
  remove: 'لرې کول', react: 'غبرګون', archived_empty: 'هېڅ Archive شوی چټ نشته', members: 'غړي', video_tap: 'د لیدو لپاره ټچ کړئ', type_location: 'ځای ولیکئ (لکه کابل)', more: 'نور',
};

export type StringKey = keyof typeof ps;
export type Dict = Record<StringKey, string>;

export const en: Dict = {
  next: 'Next', back: 'Back', save: 'Save', cancel: 'Cancel', close: 'Close', yes: 'Yes', no: 'No',
  delete: 'Delete', done: 'Done', send: 'Send', retry: 'Try again', create: 'Create', copy: 'Copy',

  welcome_title: 'Welcome to Faisal Show', welcome_sub: 'Posts, reels and chats with friends — in your language',
  signup_btn: 'Create new account', login_btn: 'Log in', login_title: 'Log in',
  email: 'Email', password: 'Password', password_again: 'Repeat password',
  forgot_q: 'Forgot password?', no_account: "Don't have an account? Sign up", have_account: 'Have an account? Log in',
  new_account: 'New account', real_name_hint: 'Use your real name', first_name: 'First name', last_name: 'Last name',
  gender: 'Gender', male: 'Male', female: 'Female', birthday: 'Birthday', day: 'Day', month: 'Month', year: 'Year',
  email_password_title: 'Email and password', email_password_sub: 'This email and password will be for Faisal Show',
  send_code: 'Send code', verify_title: 'Verify your email', code: 'Code',
  code_sent: 'We sent a 5-digit code to:', check_spam: 'Not there? Check Spam too.',
  resend: 'Resend code', resend_in: 'Resend code ({n})', verify_create: 'Verify and create account',
  change_email_btn: 'Change email', forgot_title: 'Forgot password?', forgot_sub: 'Enter your email and we will send you a code',
  new_password: 'New password', new_password_again: 'Repeat new password', change_password_btn: 'Change password',
  enter_email_password: 'Enter email and password',

  v_password: 'Password needs at least 8 characters: letters, a number and a symbol (e.g. fai123@afg)',
  v_name_required: 'Enter first and last name', v_name_long: 'Name is too long', v_name_chars: 'Numbers and symbols are not allowed in names',
  v_gender: 'Choose gender', v_birthday: 'Enter a valid birthday (day / month / year)', v_too_young: 'You must be at least 13 years old',
  v_year: 'Birth year is not valid', v_email: 'Enter a valid email, e.g. name@fainet.org', v_passwords_match: 'Passwords do not match',
  v_code5: 'Enter the 5-digit code', v_username_len: 'ID Name must be 3–20 characters',
  v_username_chars: 'Only English letters, numbers, dot (.) and _', v_username_dot: 'A dot cannot be first, last or doubled',
  v_username_reserved: 'This name is reserved',

  photo_title: 'Add your photo', photo_sub: 'People will recognise you by this photo', choose_photo: 'Choose photo',
  save_next: 'Save and continue', other_photo: 'Another photo', not_now: 'Not now', photos_permission: 'Allow access to photos',
  username_title: 'Choose your ID Name', username_sub: 'Your unique name. People will find you by it',
  bio_optional: 'Bio (optional)', bio_placeholder: 'One line about you...', start: 'Start',

  e_invalid_code: 'Wrong code. {n} tries left', e_invalid_code_plain: 'Wrong code', e_code_expired: 'Code expired. Request a new one',
  e_too_many: 'Too many wrong tries. Request a new code', e_wait: 'Please wait {n} seconds', e_rate: 'Too many attempts. Try again later',
  e_email_in_use: 'This email is already registered', e_weak_password: 'Password is too weak', e_username_taken: 'This ID Name is taken',
  e_username_invalid: 'ID Name is not valid', e_invalid_credentials: 'Wrong email or password', e_disabled: 'This account is disabled',
  e_image_big: 'File is too large', e_upload: 'Upload failed. Try again', e_email_send: 'Email could not be sent. Try again',
  e_invalid_input: 'Invalid information', e_relogin: 'Please log in again', e_network: 'Cannot reach the server. Check your internet',
  e_generic: 'Something went wrong. Try again', e_video_long: 'Video must be shorter than 60 seconds', e_video_big: 'Video must be under 25 MB',
  e_already_opened: 'This message was already opened', e_forbidden: 'Not allowed',

  tab_home: 'Home', tab_reels: 'Reels', tab_noti: 'Notifications', tab_profile: 'Profile',

  for_you: 'For You', following: 'Following', empty_following: "You don't follow anyone yet.\nFind people with search 🔍.",
  empty_feed: 'No posts yet. Be the first to post!', no_posts: 'No posts yet', featured: 'Featured',
  comment: 'Comment', share: 'Share', save_post: 'Save', comments_n: '{n} comments', shares_n: '{n} shares',
  delete_post: 'Delete post', delete_post_q: 'Delete?', delete_forever: 'This will be deleted forever', yes_delete: 'Yes, delete',
  report: 'Report', report_thanks: 'Thanks. Your report was received.', post_missing: 'This post does not exist or was deleted',
  first_comment: 'Be the first to comment', write_comment: 'Write a comment... (@name)', delete_comment_q: 'Delete comment?',
  post_title: 'Post', new_post: 'New post', whats_on_mind: "What's on your mind?", photo: 'Photo', video: 'Video', location: 'Location',
  feeling: 'Feeling', feeling_title: 'How are you feeling?', is_feeling: 'feeling {f}', at_location: '📍 {l}', location_permission: 'Allow location access',
  locating: 'Finding location...', time_now: 'just now', time_min: '{n} min ago', time_hour: '{n} h ago', time_day: '{n} d ago',
  no_reels: 'No reels yet. Post the first video!',

  posts: 'Posts', saved: 'Saved', empty_saved: "You haven't saved any posts", empty_my_posts: "You haven't posted yet",
  new_post_btn: 'New post +', follow: 'Follow', following_btn: 'Following ✓', follow_back: 'Follow Back', profile_title: 'Profile',
  message_btn: 'Message', logout: 'Log out',

  search_title: 'Search', search_placeholder: 'Search name or @ID Name', nobody_found: 'Nobody found', find_people: 'Find friends and new people',
  followers: 'Followers',

  n_like: 'liked your post', n_comment: 'commented on your post', n_mention: 'mentioned you in a comment', n_follow: 'followed you',
  no_notifications: 'No notifications yet',

  settings: 'Settings', language: 'Language', personalize: 'Personal info', privacy_policy: 'Privacy policy', about: 'About',
  logout_q: 'Log out of your account?', delete_account: 'Delete account', delete_account_warn: 'Your account, posts, comments and photos will be deleted forever. This cannot be undone.',
  enter_password: 'Enter your password to confirm', lang_title: 'Choose language', lang_more: 'Install new language', lang_more_sub: 'More languages coming soon: Urdu, Arabic, Turkish...',
  lang_installed: 'Installed', edit_profile: 'Name and bio', change_photo: 'Change photo', change_email: 'Change email', change_password: 'Change password',
  current_password: 'Current password', saved_ok: 'Saved ✓', current_email: 'Current email: {e}', new_email: 'New email',
  email_change_sub: 'A 5-digit code will be sent to the new email. The ✓ mark is only for @fainet.org emails.',
  password_changed: 'Password changed ✓', email_changed: 'Email changed ✓', version: 'Version {v}', account: 'Account', app: 'App',
  verified_info: '✓ The verified mark is only given to accounts with an @fainet.org email.',
  policy_text:
    'Faisal Show respects your privacy.\n\n• What we collect: your name, email, birthday, gender, photo, posts, comments, messages and any location you add to a post yourself.\n\n• Why: to create your account, show posts and messages, and keep the app secure.\n\n• Who sees it: your email and birthday are visible only to you. Posts and your profile are visible to other users. Messages are visible only to the members of that chat.\n\n• We do not sell your data or give it to advertisers.\n\n• Your choice: you can change your information at any time and permanently delete your account from Settings.\n\n• Security: passwords are stored hashed, and every message and file is only accessible to its owners.\n\nQuestions: support@fainet.org',
  about_text:
    'Faisal Show is a social app made for Afghans: posts, reels, chats and notifications — in Pashto, Dari and English.\n\nCreator: Faisal Hadawal\nWeb: fainet.org',

  chats: 'Chats', archived: 'Archived', new_message: 'New message', new_group: 'New group', group_name: 'Group name',
  choose_members: 'Choose members', no_chats: 'No chats yet.\nStart one with the ✏️ button.', type_message: 'Message...',
  view_once: 'View once', view_once_on: 'View once message: on 🔒', view_once_tap: '🔒 Tap to view (once only)',
  view_once_sent: '🔒 View once message', opened: 'Opened', deleted_msg: '🚫 This message was deleted', reply: 'Reply',
  delete_for_everyone: 'Delete for everyone', archive: 'Archive', unarchive: 'Unarchive', leave_group: 'Leave group',
  you: 'You', members_n: '{n} members', add_members: 'Add members', start_chat_hint: 'Search name or @ID', replying_to: 'Replying to {name}',
  once_closes: 'This message will close and cannot be opened again', group_created_by_you: 'Group created', online_now: 'Faisal Show',
  f_happy: 'happy', f_loved: 'loved', f_sad: 'sad', f_cool: 'cool', f_thinking: 'thoughtful', f_tired: 'tired', f_party: 'celebrating', f_thankful: 'thankful', f_angry: 'angry', f_sick: 'sick',
  remove: 'Remove', react: 'React', archived_empty: 'No archived chats', members: 'Members', video_tap: 'Tap to watch', type_location: 'Type a place (e.g. Kabul)', more: 'More',
};

export const fa: Dict = {
  next: 'بعدی', back: 'برگشت', save: 'ذخیره', cancel: 'لغو', close: 'بستن', yes: 'بلی', no: 'نخیر',
  delete: 'حذف', done: 'شد', send: 'ارسال', retry: 'دوباره کوشش', create: 'ساختن', copy: 'کاپی',

  welcome_title: 'به Faisal Show خوش آمدید', welcome_sub: 'پست‌ها، ریلز و چت با دوستان — به زبان خودتان',
  signup_btn: 'ساختن حساب جدید (Sign up)', login_btn: 'ورود (Login)', login_title: 'ورود',
  email: 'ایمیل', password: 'رمز', password_again: 'رمز را دوباره بنویسید',
  forgot_q: 'رمز را فراموش کرده‌اید؟', no_account: 'حساب ندارید؟ Sign up', have_account: 'حساب دارید؟ Login',
  new_account: 'حساب جدید', real_name_hint: 'نام واقعی خود را بنویسید', first_name: 'نام', last_name: 'تخلص',
  gender: 'جنسیت', male: 'مرد', female: 'زن', birthday: 'تاریخ تولد', day: 'روز', month: 'ماه', year: 'سال',
  email_password_title: 'ایمیل و رمز', email_password_sub: 'این ایمیل و رمز برای Faisal Show خواهد بود',
  send_code: 'ارسال کود', verify_title: 'ایمیل را تایید کنید', code: 'کود',
  code_sent: 'یک کود ۵ رقمی به این ایمیل فرستادیم:', check_spam: 'اگر نیامد، Spam را هم ببینید.',
  resend: 'ارسال دوباره کود', resend_in: 'ارسال دوباره کود ({n})', verify_create: 'تایید و ساختن حساب',
  change_email_btn: 'تغییر ایمیل', forgot_title: 'رمز را فراموش کرده‌اید؟', forgot_sub: 'ایمیل خود را بنویسید، برایتان کود می‌فرستیم',
  new_password: 'رمز جدید', new_password_again: 'رمز جدید را دوباره بنویسید', change_password_btn: 'تغییر رمز',
  enter_email_password: 'ایمیل و رمز را بنویسید',

  v_password: 'رمز باید حداقل ۸ حرف داشته باشد: حرف، عدد و یک علامه (مثل fai123@afg)',
  v_name_required: 'نام و تخلص را بنویسید', v_name_long: 'نام خیلی طولانی است', v_name_chars: 'عدد و علامه در نام قبول نمی‌شود',
  v_gender: 'جنسیت را انتخاب کنید', v_birthday: 'تاریخ تولد را درست بنویسید (روز / ماه / سال)', v_too_young: 'برای ساختن حساب باید حداقل ۱۳ ساله باشید',
  v_year: 'سال تولد درست نیست', v_email: 'ایمیل را درست بنویسید، مثل name@fainet.org', v_passwords_match: 'هر دو رمز یکسان نیستند',
  v_code5: 'کود ۵ رقمی را بنویسید', v_username_len: 'ID Name باید بین ۳ تا ۲۰ حرف باشد',
  v_username_chars: 'فقط حروف انگلیسی، عدد، نقطه (.) و _', v_username_dot: 'نقطه در اول، آخر یا دو بار پشت سر هم نمی‌آید',
  v_username_reserved: 'این نام محفوظ است',

  photo_title: 'عکس خود را بگذارید', photo_sub: 'مردم شما را با این عکس می‌شناسند', choose_photo: 'انتخاب عکس',
  save_next: 'ذخیره و ادامه', other_photo: 'عکس دیگر', not_now: 'حالا نه', photos_permission: 'اجازه دسترسی به عکس‌ها را بدهید',
  username_title: 'ID Name خود را انتخاب کنید', username_sub: 'این نام یگانه شماست. مردم شما را با آن پیدا می‌کنند',
  bio_optional: 'بیو (اختیاری)', bio_placeholder: 'یک خط درباره خودتان...', start: 'شروع',

  e_invalid_code: 'کود اشتباه است. {n} کوشش باقی مانده', e_invalid_code_plain: 'کود اشتباه است', e_code_expired: 'کود ختم شده. کود جدید بخواهید',
  e_too_many: 'کوشش‌های اشتباه زیاد شد. کود جدید بخواهید', e_wait: 'لطفاً {n} ثانیه صبر کنید', e_rate: 'کوشش‌ها زیاد شد. کمی بعد دوباره کوشش کنید',
  e_email_in_use: 'این ایمیل قبلاً ثبت شده', e_weak_password: 'رمز ضعیف است', e_username_taken: 'این ID Name را کس دیگری گرفته',
  e_username_invalid: 'ID Name درست نیست', e_invalid_credentials: 'ایمیل یا رمز اشتباه است', e_disabled: 'این حساب مسدود شده',
  e_image_big: 'فایل خیلی بزرگ است', e_upload: 'فایل بالا نشد. دوباره کوشش کنید', e_email_send: 'ایمیل فرستاده نشد. دوباره کوشش کنید',
  e_invalid_input: 'معلومات درست نیست', e_relogin: 'دوباره Login کنید', e_network: 'به سرور وصل نمی‌شویم. انترنت را ببینید',
  e_generic: 'مشکلی پیش آمد. دوباره کوشش کنید', e_video_long: 'ویدیو باید کمتر از ۶۰ ثانیه باشد', e_video_big: 'ویدیو باید کمتر از 25MB باشد',
  e_already_opened: 'این پیام قبلاً باز شده', e_forbidden: 'اجازه نیست',

  tab_home: 'Home', tab_reels: 'Reels', tab_noti: 'Notifications', tab_profile: 'Profile',

  for_you: 'For You', following: 'Following', empty_following: 'شما هنوز کسی را Follow نکرده‌اید.\nبا جستجو 🔍 مردم را پیدا کنید.',
  empty_feed: 'هنوز هیچ پستی نیست. اولین پست را شما بگذارید!', no_posts: 'هنوز هیچ پستی نیست', featured: 'ویژه',
  comment: 'کامنت', share: 'شریک', save_post: 'ذخیره', comments_n: '{n} کامنت', shares_n: '{n} شریک',
  delete_post: 'حذف پست', delete_post_q: 'حذف شود؟', delete_forever: 'این برای همیشه حذف می‌شود', yes_delete: 'بلی، حذف شود',
  report: 'گزارش (Report)', report_thanks: 'تشکر. گزارش شما رسید.', post_missing: 'این پست وجود ندارد یا حذف شده',
  first_comment: 'اولین کامنت را شما بنویسید', write_comment: 'کامنت بنویسید... (@name)', delete_comment_q: 'کامنت حذف شود؟',
  post_title: 'پست', new_post: 'پست جدید', whats_on_mind: 'به چه فکر می‌کنید؟', photo: 'عکس', video: 'ویدیو', location: 'موقعیت',
  feeling: 'احساس', feeling_title: 'چه احساسی دارید؟', is_feeling: 'احساس: {f}', at_location: '📍 {l}', location_permission: 'اجازه موقعیت را بدهید',
  locating: 'موقعیت پیدا می‌شود...', time_now: 'همین حالا', time_min: '{n} دقیقه پیش', time_hour: '{n} ساعت پیش', time_day: '{n} روز پیش',
  no_reels: 'هنوز هیچ ریلی نیست. اولین ویدیو را شما بگذارید!',

  posts: 'پست‌ها', saved: 'ذخیره شده', empty_saved: 'هنوز هیچ پستی ذخیره نکرده‌اید', empty_my_posts: 'هنوز هیچ پستی نگذاشته‌اید',
  new_post_btn: 'پست جدید +', follow: 'Follow', following_btn: 'Following ✓', follow_back: 'Follow Back', profile_title: 'پروفایل',
  message_btn: 'پیام', logout: 'خروج (Logout)',

  search_title: 'جستجو', search_placeholder: 'نام یا @ID Name را جستجو کنید', nobody_found: 'کسی پیدا نشد', find_people: 'دوستان و افراد جدید را پیدا کنید',
  followers: 'Followers',

  n_like: 'پست شما را Like کرد', n_comment: 'به پست شما کامنت کرد', n_mention: 'شما را در کامنت یاد کرد', n_follow: 'شما را Follow کرد',
  no_notifications: 'هنوز هیچ اطلاعیه‌ای نیست',

  settings: 'تنظیمات', language: 'زبان', personalize: 'معلومات شخصی', privacy_policy: 'پالیسی حریم خصوصی', about: 'درباره ما',
  logout_q: 'از حساب خارج می‌شوید؟', delete_account: 'حذف حساب', delete_account_warn: 'حساب، پست‌ها، کامنت‌ها و عکس‌های شما برای همیشه حذف می‌شوند. این کار برگشت ندارد.',
  enter_password: 'برای تایید رمز خود را بنویسید', lang_title: 'زبان را انتخاب کنید', lang_more: 'نصب زبان جدید', lang_more_sub: 'زبان‌های دیگر به زودی: اردو، عربی، ترکی...',
  lang_installed: 'نصب شده', edit_profile: 'نام و بیو', change_photo: 'تغییر عکس', change_email: 'تغییر ایمیل', change_password: 'تغییر رمز',
  current_password: 'رمز فعلی', saved_ok: 'ذخیره شد ✓', current_email: 'ایمیل فعلی: {e}', new_email: 'ایمیل جدید',
  email_change_sub: 'یک کود ۵ رقمی به ایمیل جدید فرستاده می‌شود. نشان ✓ فقط برای ایمیل‌های @fainet.org است.',
  password_changed: 'رمز تغییر کرد ✓', email_changed: 'ایمیل تغییر کرد ✓', version: 'نسخه {v}', account: 'حساب', app: 'اپ',
  verified_info: '✓ نشان تایید فقط به حساب‌هایی داده می‌شود که ایمیل آن‌ها @fainet.org باشد.',
  policy_text:
    'Faisal Show به حریم خصوصی شما احترام می‌گذارد.\n\n• چه جمع می‌کنیم: نام، ایمیل، تاریخ تولد، جنسیت، عکس، پست‌ها، کامنت‌ها، پیام‌ها و موقعیتی که خودتان به پست اضافه می‌کنید.\n\n• چرا: برای ساختن حساب، نشان دادن پست‌ها و پیام‌ها، و امنیت اپ.\n\n• چه کسی می‌بیند: ایمیل و تاریخ تولد فقط برای خودتان دیده می‌شود. پست‌ها و پروفایل برای کاربران دیگر دیده می‌شود. پیام‌ها فقط برای اعضای همان چت.\n\n• ما معلومات شما را نمی‌فروشیم و به اعلانات نمی‌دهیم.\n\n• اختیار شما: هر وقت می‌توانید معلومات خود را تغییر دهید و از تنظیمات حساب خود را برای همیشه حذف کنید.\n\n• امنیت: رمزها به صورت hash نگهداری می‌شوند و هر پیام و فایل فقط برای صاحبانش قابل دسترسی است.\n\nبرای سوال‌ها: support@fainet.org',
  about_text:
    'Faisal Show یک اپ اجتماعی است که برای افغان‌ها ساخته شده: پست‌ها، ریلز، چت و اطلاعیه‌ها — به پشتو، دری و انگلیسی.\n\nسازنده: Faisal Hadawal\nویب: fainet.org',

  chats: 'چت‌ها', archived: 'آرشیف شده', new_message: 'پیام جدید', new_group: 'گروپ جدید', group_name: 'نام گروپ',
  choose_members: 'اعضا را انتخاب کنید', no_chats: 'هنوز هیچ چتی نیست.\nبا دکمه ✏️ پیام جدید شروع کنید.', type_message: 'پیام بنویسید...',
  view_once: 'یک بار دیدن', view_once_on: 'پیام یک بار دیدنی: فعال 🔒', view_once_tap: '🔒 برای دیدن لمس کنید (فقط یک بار)',
  view_once_sent: '🔒 پیام یک بار دیدنی', opened: 'باز شد', deleted_msg: '🚫 این پیام حذف شده', reply: 'جواب',
  delete_for_everyone: 'حذف برای همه', archive: 'آرشیف', unarchive: 'خارج از آرشیف', leave_group: 'خروج از گروپ',
  you: 'شما', members_n: '{n} عضو', add_members: 'اضافه کردن اعضا', start_chat_hint: 'نام یا @ID را جستجو کنید', replying_to: 'جواب به {name}',
  once_closes: 'این پیام بسته می‌شود و دوباره باز نمی‌شود', group_created_by_you: 'گروپ ساخته شد', online_now: 'Faisal Show',
  f_happy: 'خوشحال', f_loved: 'عاشق', f_sad: 'غمگین', f_cool: 'عالی', f_thinking: 'در فکر', f_tired: 'خسته', f_party: 'جشن', f_thankful: 'شکرگزار', f_angry: 'عصبانی', f_sick: 'مریض',
  remove: 'حذف', react: 'واکنش', archived_empty: 'هیچ چت آرشیف شده‌ای نیست', members: 'اعضا', video_tap: 'برای دیدن لمس کنید', type_location: 'جای را بنویسید (مثل کابل)', more: 'بیشتر',
};
