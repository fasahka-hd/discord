



export const BADGE_CATEGORIES = [
  { id: 'general', title: 'Основные' },
  { id: 'staff', title: 'Модерация и разработка' },
  { id: 'bot', title: 'Боты и приложения' },
  { id: 'boost', title: 'Буст-уровни' },
  { id: 'gifting', title: 'Щедрость (подарки)' },
  { id: 'age', title: 'Возраст аккаунта' },
  { id: 'streaming', title: 'Стримы' },
  { id: 'gametime', title: 'Часов в играх' },
  { id: 'variety', title: 'Разнообразие игр' },
  { id: 'subscription', title: 'Уровни подписки' },
]

const B = (id, name, desc, icon, cat) => ({ id, name, desc, icon, cat })

export const BADGES = [
  
  B('staff', 'Сотрудник Discord', 'Выдаётся сотрудникам Discord (модераторам и персоналу).', '/badges/discord-staff.svg', 'general'),
  B('partner', 'Партнёр Discord', 'Для серверов-партнёров Discord.', '/badges/discord-partner.svg', 'general'),
  B('bug_hunter_1', 'Охотник за багами', 'Нашёл и сообщил о баге в программе Bug Bounty.', '/badges/discord-bug-hunter-green.svg', 'general'),
  B('bug_hunter_2', 'Эксперт-охотник за багами', 'Второй уровень программы охоты за багами.', '/badges/discord-bug-hunter-gold.svg', 'general'),
  B('hypesquad_events', 'HypeSquad Events', 'Участник событий HypeSquad (программа закрыта).', '/badges/hype-squad-events.svg', 'general'),
  B('bravery', 'HypeSquad: Отвага', 'Дом HypeSquad — Отвага.', '/badges/hype-squad-bravery.svg', 'general'),
  B('brilliance', 'HypeSquad: Блеск', 'Дом HypeSquad — Блеск.', '/badges/hype-squad-brilliance.svg', 'general'),
  B('balance', 'HypeSquad: Баланс', 'Дом HypeSquad — Баланс.', '/badges/hype-squad-balance.svg', 'general'),
  B('early_supporter', 'Ранний сторонник', 'Оформил Nitro до октября 2018 года.', '/badges/discord-early-supporter.svg', 'general'),
  B('nitro', 'Nitro', 'Активная подписка Discord Nitro.', '/badges/discord-nitro.svg', 'general'),
  B('nitro_basic', 'Nitro Basic', 'Активная подписка Discord Nitro Basic.', '/badges/discord-nitro-basic.svg', 'general'),
  B('legacy_username', 'Изначально известен как', 'Аккаунт со старым уникальным тегом (#0001—#9999).', '/badges/username.png', 'general'),
  B('quest', 'Прошёл квест', 'Завершил квест из вкладки подарков.', '/badges/quest.png', 'general'),

  
  B('certified_moderator', 'Сертифицированный модератор', 'Прошел экзамен Discord Certified Moderator.', '/badges/old-discord-mod.svg', 'staff'),
  B('mod_alumni', 'Moderator Programs Alumni', 'Ветеран программ модерации Discord.', '/badges/discord-mod.svg', 'staff'),
  B('verified_dev', 'Верифицированный разработчик', 'Ранний верифицированный разработчик ботов.', '/badges/discord-bot-dev.svg', 'staff'),
  B('active_dev', 'Активный разработчик', 'Разработчик, чей бот активно используется сообществом.', '/badges/active-developer.svg', 'staff'),

  
  B('verified_bot', 'Верифицированный бот', 'Бот, прошедший верификацию Discord.', '/badges/special/verified-bot.svg', 'bot'),
  B('verified_app', 'Верифицированное приложение', 'Приложение, прошедшее верификацию Discord.', '/badges/special/verified-app.svg', 'bot'),
  B('bot_tag', 'Бот', 'Учётная запись бота.', '/badges/special/bot.svg', 'bot'),
  B('app_tag', 'Приложение', 'Учётная запись приложения.', '/badges/special/app.svg', 'bot'),
  B('system', 'Система', 'Системный пользователь Discord (срочные сообщения).', '/badges/special/system.svg', 'bot'),
  B('official', 'Официальный аккаунт', 'Официальный аккаунт бренда или игры.', '/badges/special/official.svg', 'bot'),
  B('beta', 'Бета-тестировщик', 'Участник бета-тестирования Discord.', '/badges/special/beta.svg', 'bot'),
  B('supports_commands', 'Поддержка команд', 'Бот поддерживает команды приложений.', '/badges/supports-commands.svg', 'bot'),
  B('automod', 'AutoMod', 'Бот, помогающий с автомодерацией.', '/badges/automod.svg', 'bot'),
  B('premium_bot', 'Премиум-бот', 'Бот с платными функциями.', '/badges/premium-bot.png', 'bot'),
  B('original_poster', 'Автор', 'Автор оригинального сообщения в ветке.', '/badges/special/original-poster.svg', 'bot'),
  B('new_here', 'Я здесь новый', 'Новичок на сервере.', '/badges/special/new-here.svg', 'bot'),
  B('server_member', 'Участник сервера', 'Значок участия в сервере.', '/badges/special/server.svg', 'bot'),

  
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n =>
    B(`boost_${n}`, `Буст-уровень ${n}`, `Достигнут ${n}-й уровень буста сервера.`, `/badges/boosts/discord-boost-${n}.svg`, 'boost')),

  
  B('gift_patron', 'Меценат', 'Дарил много подписок Nitro.', '/badges/gifting/patron.png', 'gifting'),
  B('gift_champion', 'Чемпион', 'Дарил подписки и бусты друзьям.', '/badges/gifting/champion.png', 'gifting'),
  B('gift_luminary', 'Светило', 'Выдающийся даритель.', '/badges/gifting/luminary.png', 'gifting'),
  B('gift_icon', 'Икона', 'Легенда среди дарителей.', '/badges/gifting/icon.png', 'gifting'),
  B('gift_hero', 'Герой', 'Помогал друзьям подписками.', '/badges/gifting/hero.png', 'gifting'),
  B('gift_legend', 'Легенда', 'Максимальный уровень щедрости.', '/badges/gifting/legend.png', 'gifting'),

  
  B('age_seed', 'Семя', 'Аккаунту больше 6 месяцев.', '/badges/account-age/seed.svg', 'age'),
  B('age_sprout', 'Росток', 'Аккаунту больше года.', '/badges/account-age/sprout.svg', 'age'),
  B('age_sapling', 'Саженец', 'Аккаунту больше 2 лет.', '/badges/account-age/sapling.svg', 'age'),
  B('age_bud', 'Почка', 'Аккаунту больше 3 лет.', '/badges/account-age/bud.svg', 'age'),
  B('age_blossom', 'Цветение', 'Аккаунту больше 4 лет.', '/badges/account-age/blossom.svg', 'age'),
  B('age_tree', 'Дерево', 'Аккаунту больше 5 лет.', '/badges/account-age/sequoia.svg', 'age'),
  B('age_redwood', 'Пойнсеттия', 'Аккаунту больше 6 лет.', '/badges/account-age/redwood.svg', 'age'),
  B('age_stromatolite', 'Строматолит', 'Аккаунту больше 7 лет.', '/badges/account-age/stromatolite.svg', 'age'),
  B('age_bristlecone', 'Сосна остистая', 'Аккаунту больше 8 лет.', '/badges/account-age/bristlecone.svg', 'age'),
  B('age_primordial', 'Первозданный', 'Аккаунту больше 9 лет — ровесник Discord.', '/badges/account-age/primordial.svg', 'age'),

  
  B('stream_newcomer', 'Новичок-стример', 'Начал стримить на Discord.', '/badges/streaming/newcomer.svg', 'streaming'),
  B('stream_fledgling', 'Неопытный стример', 'Провёл первые стримы.', '/badges/streaming/fledgling.svg', 'streaming'),
  B('stream_breakout', 'Прорыв', 'Набрал первую аудиторию на стримах.', '/badges/streaming/breakout.svg', 'streaming'),
  B('stream_standout', 'Заметный', 'Выделяющийся стример.', '/badges/streaming/standout.svg', 'streaming'),
  B('stream_star', 'Звезда', 'Популярный стример Discord.', '/badges/streaming/star.svg', 'streaming'),
  B('stream_trendsetter', 'Законодатель трендов', 'Задаёт тренды в стримах.', '/badges/streaming/trendsetter.svg', 'streaming'),
  B('stream_headliner', 'Хедлайнер', 'Стример-хедлайнер.', '/badges/streaming/headliner.svg', 'streaming'),
  B('stream_sensation', 'Сенсация', 'Стрим-сенсация сообщества.', '/badges/streaming/sensation.svg', 'streaming'),
  B('stream_visionary', 'Визионер', 'Новатор среди стримеров.', '/badges/streaming/visionary.svg', 'streaming'),
  B('stream_phenomenon', 'Феномен', 'Максимальный уровень стримера.', '/badges/streaming/phenomenon.svg', 'streaming'),

  
  B('gt_casual', 'Любитель игр', 'Немного времени в играх.', '/badges/game-time/casual.svg', 'gametime'),
  B('gt_recreational', 'Рекреационный игрок', 'Регулярно играет.', '/badges/game-time/recreational.svg', 'gametime'),
  B('gt_dedicated', 'Преданный игрок', 'Много времени в играх.', '/badges/game-time/dedicated.svg', 'gametime'),
  B('gt_serious', 'Серьёзный игрок', 'Серьёзно увлечён играми.', '/badges/game-time/serious.svg', 'gametime'),
  B('gt_seasoned', 'Опытный игрок', 'Опытный геймер Discord.', '/badges/game-time/seasoned.svg', 'gametime'),
  B('gt_committed', 'Закалённый игрок', 'Постоянная игровая активность.', '/badges/game-time/committed.svg', 'gametime'),
  B('gt_devoted', 'Игривый дух', 'Отданный играм.', '/badges/game-time/devoted.svg', 'gametime'),
  B('gt_ironclad', 'Стальной игрок', 'Железная игровая выдержка.', '/badges/game-time/ironclad.svg', 'gametime'),
  B('gt_unshakeable', 'Непоколебимый', 'Почти топ по наигранному.', '/badges/game-time/unshakeable.svg', 'gametime'),
  B('gt_eternal', 'Вечный игрок', 'Максимальный уровень игрового времени.', '/badges/game-time/eternal.svg', 'gametime'),

  
  B('gv_dabbler', 'Пробователь', 'Попробовал несколько игр.', '/badges/game-variety/dabbler.svg', 'variety'),
  B('gv_sampler', 'Дегустатор', 'Пробует разные игры.', '/badges/game-variety/sampler.svg', 'variety'),
  B('gv_explorer', 'Исследователь', 'Исследует игровые жанры.', '/badges/game-variety/explorer.svg', 'variety'),
  B('gv_enthusiast', 'Энтузиаст', 'Энтузиаст разных игр.', '/badges/game-variety/enthusiast.svg', 'variety'),
  B('gv_adventurer', 'Искатель приключений', 'Постоянно открывает новые игры.', '/badges/game-variety/adventurer.svg', 'variety'),
  B('gv_ranger', 'Следопыт', 'Хорошо ориентируется в играх.', '/badges/game-variety/ranger.svg', 'variety'),
  B('gv_maverick', 'Оригинал', 'Играет не как все.', '/badges/game-variety/maverick.svg', 'variety'),
  B('gv_polymath', 'Универсал', 'Разбирается во множестве игр.', '/badges/game-variety/polymath.svg', 'variety'),
  B('gv_voyager', 'Путешественник', 'Путешествует по игровым мирам.', '/badges/game-variety/voyager.svg', 'variety'),
  B('gv_universalist', 'Универсалист', 'Максимальный уровень разнообразия игр.', '/badges/game-variety/universalist.svg', 'variety'),

  
  B('sub_bronze', 'Подписка: Бронза', '1 месяц подписки.', '/badges/subscriptions/badges/bronze.png', 'subscription'),
  B('sub_silver', 'Подписка: Серебро', '3 месяца подписки.', '/badges/subscriptions/badges/silver.png', 'subscription'),
  B('sub_gold', 'Подписка: Золото', '6 месяцев подписки.', '/badges/subscriptions/badges/gold.png', 'subscription'),
  B('sub_platinum', 'Подписка: Платина', '9 месяцев подписки.', '/badges/subscriptions/badges/platinum.png', 'subscription'),
  B('sub_diamond', 'Подписка: Алмаз', '1 год подписки.', '/badges/subscriptions/badges/diamond.png', 'subscription'),
  B('sub_emerald', 'Подписка: Изумруд', '2 года подписки.', '/badges/subscriptions/badges/emerald.png', 'subscription'),
  B('sub_ruby', 'Подписка: Рубин', '3 года подписки.', '/badges/subscriptions/badges/ruby.png', 'subscription'),
  B('sub_opal', 'Подписка: Опал', '4 года подписки.', '/badges/subscriptions/badges/opal.png', 'subscription'),
]

export const BADGE_IDS = new Set(BADGES.map(b => b.id))
export const BADGE_BY_ID = Object.fromEntries(BADGES.map(b => [b.id, b]))


export const BADGE_PERMS = {
  staff: ['suspend', 'ban', 'delete_any_message'],
  certified_moderator: ['suspend', 'delete_any_message'],
  mod_alumni: ['delete_any_message'],
}
export const PERM_LABELS = {
  suspend: 'приостановка аккаунтов',
  ban: 'блокировка аккаунтов',
  delete_any_message: 'удаление любых сообщений',
}
export function permsOf(badges = []) {
  const out = new Set()
  for (const b of badges) for (const p of BADGE_PERMS[b] || []) out.add(p)
  return [...out]
}



export const CHAT_BADGE_IDS = new Set(['staff', 'bot_tag', 'verified_bot', 'app_tag', 'verified_app', 'system', 'official', 'new_here'])
export function chatBadges(ids = []) { return ids.filter(id => CHAT_BADGE_IDS.has(id)) }
