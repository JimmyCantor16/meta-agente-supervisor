Dixel.define('IconCategories', ['IconSet'], function (IconSet) {
  'use strict';

  const categories = {
    interfaz: [
      'close', 'menu', 'plus', 'minus', 'check', 'checkCircle', 'search', 'searchX',
      'searchHeart', 'searchCheck', 'settings', 'settingsAlt', 'tune', 'sliders',
      'toggleLeft', 'toggleRight', 'home', 'homeHeart', 'homeWifi', 'homePlus',
      'dashboard', 'download', 'upload', 'external', 'link', 'link2', 'linkOff',
      'copy', 'copyCheck', 'copyPlus', 'trash', 'edit', 'eye', 'eyeOff', 'filter',
      'filterX', 'grid', 'gridPlus', 'moreGrid', 'list', 'listChecks', 'layers',
      'layoutSidebar', 'layoutTop', 'bookmark', 'bookmarkPlus', 'bookmarkX',
      'bookmarkCheck', 'info', 'help', 'alertTriangle', 'alertOctagon', 'ban',
      'loader', 'moreHorizontal', 'moreVertical', 'dragHandle', 'crop', 'zoomIn',
      'zoomOut', 'contrast', 'power', 'logIn', 'logOut', 'scan', 'save', 'puzzle',
      'magnet', 'wrench', 'dice', 'plusCircle', 'minusCircle', 'xCircle',
      'plusSquare', 'minusSquare', 'xSquare', 'checkSquare', 'palette', 'wand',
      'brush', 'pipette', 'eraser', 'type', 'textBold', 'textItalic',
      'textUnderline', 'textStrikethrough', 'alignLeft', 'alignCenter',
      'alignRight', 'indent', 'outdent', 'quote', 'command', 'keyCap', 'altKey',
      'shiftKey', 'capsLock', 'enterKey', 'backspace', 'spaceBar'
    ],
    flechas: [
      'arrowRight', 'arrowLeft', 'arrowUp', 'arrowDown', 'arrowUpRight',
      'arrowUpLeft', 'arrowDownRight', 'arrowDownLeft', 'arrowsLeftRight',
      'arrowsUpDown', 'arrowsExchange', 'arrowBounce', 'arrowElbow',
      'arrowRightFromLine', 'arrowLeftFromLine', 'arrowBigUp', 'arrowBigDown',
      'arrowUpCircle', 'arrowDownCircle', 'arrowLeftCircle', 'arrowRightCircle',
      'arrowTurnUp', 'arrowTurnDown', 'arrowTurnLeft', 'arrowTurnRight',
      'arrowsMaximize', 'arrowsMinimize', 'arrowSplit', 'arrowMerge',
      'arrowUpFromDot', 'arrowUpToLine', 'arrowDownFromLine', 'chevronRight',
      'chevronLeft', 'chevronUp', 'chevronDown', 'chevronsRight', 'chevronsLeft',
      'chevronsUp', 'chevronsDown', 'chevronsUpDown', 'chevronsDownUp',
      'chevronUpCircle', 'chevronDownCircle', 'cornerUpRight', 'cornerUpLeft',
      'cornerDownRight', 'cornerDownLeft', 'undo', 'redo', 'expand', 'collapse',
      'maximize', 'minimize', 'refresh', 'shuffle', 'repeat', 'repeatOne',
      'sortAsc', 'sortDesc', 'rotateCw', 'rotateCcw', 'move'
    ],
    archivos: [
      'file', 'fileText', 'filePlus', 'fileMinus', 'fileCheck', 'fileX', 'fileCode',
      'fileZip', 'fileSearch', 'fileImage', 'fileVideo', 'fileAudio', 'fileHeart',
      'fileLock', 'fileUser', 'fileClock', 'filePen', 'fileWarning',
      'fileDownload', 'fileUpload', 'fileStar', 'folder', 'folderOpen',
      'folderPlus', 'folderMinus', 'folderCheck', 'folderX', 'folderSearch',
      'folderStar', 'folderLock', 'folderHeart', 'folderCode', 'folderDownload',
      'folderUpload', 'folderClock', 'clipboard', 'clipboardCheck',
      'clipboardList', 'archive', 'box'
    ],
    media: [
      'play', 'playCircle', 'pause', 'pauseCircle', 'stop', 'stopCircle', 'volume',
      'volumeOff', 'volumeLow', 'volumePlus', 'image', 'imagePlus', 'gallery',
      'camera', 'cameraOff', 'cameraPlus', 'video', 'videoOff', 'videoPlus',
      'mic', 'micOff', 'headphones', 'speaker', 'music', 'musicNote', 'musicOff',
      'playlist', 'playlistPlus', 'waveform', 'skipForward', 'skipBack',
      'fastForward', 'rewind', 'radio', 'tv', 'cast', 'airplay', 'film',
      'clapperboard', 'subtitles', 'disc', 'podcast', 'aperture', 'equalizer'
    ],
    comunicacion: [
      'mail', 'mailOpen', 'mailAlert', 'mailStar', 'mailPlus', 'mailCheck',
      'mailSearch', 'mailLock', 'mailHeart', 'mailOff', 'mailbox', 'inbox',
      'inboxIn', 'inboxOut', 'send', 'reply', 'replyAll', 'forward',
      'messageCircle', 'messageSquare', 'messageText', 'messageOff', 'chatDots',
      'chatHeart', 'chatAlert', 'chatCheck', 'chatPlus', 'chatX', 'chatQuestion',
      'chatLock', 'chatStar', 'phone', 'phoneCall', 'phoneOff', 'phoneIncoming',
      'phoneOutgoing', 'phonePlus', 'phoneX', 'videocall', 'voicemail',
      'contactBook', 'atSign', 'bell', 'bellOff', 'bellRing', 'bellDot',
      'bellSnooze', 'bellPlus', 'bellCheck', 'bellMinus', 'notificationSquare',
      'notificationDot'
    ],
    social: [
      'user', 'users', 'userPlus', 'userMinus', 'userCheck', 'userX', 'userHeart',
      'userCircle', 'userSquare', 'userGear', 'userStar', 'userClock',
      'teamGroup', 'thumbsUp', 'thumbsDown', 'heart', 'heartPlus', 'heartCheck',
      'heartMinus', 'handHeart', 'share', 'share2', 'repost', 'verified',
      'megaphone', 'liveDot', 'rss', 'hash', 'crown'
    ],
    comercio: [
      'cart', 'cartPlus', 'cartCheck', 'cartX', 'basket', 'store', 'shoppingBag',
      'package', 'packageCheck', 'creditCard', 'wallet', 'coin', 'coins',
      'bitcoin', 'dollarSign', 'euroSign', 'cashBill', 'piggyBank', 'handCoin',
      'moneyBag', 'barcode', 'qrCode', 'receipt', 'percent', 'percentCircle',
      'gift', 'ticket', 'tag', 'tagPlus', 'scale',
      'cashRegister', 'bankBuilding', 'banknote', 'coinsStack', 'flagCheckered'
    ],
    desarrollo: [
      'code', 'terminal', 'terminal2', 'brackets', 'braces', 'variable', 'api',
      'bug', 'gitBranch', 'gitCommit', 'gitMerge', 'gitPullRequest', 'gitFork',
      'gitCompare', 'cpu', 'memoryChip', 'server', 'harddrive', 'binary', 'zap',
      'monitor', 'monitorCheck', 'monitorPlay', 'laptop', 'laptopCode',
      'smartphone', 'phoneVibrate', 'tablet', 'mouse', 'keyboard', 'plug',
      'battery', 'batteryLow', 'batteryFull', 'batteryCharging', 'batteryAlert',
      'usb', 'ethernet', 'webcam', 'gamepad', 'bluetooth', 'bluetoothOff', 'wifi',
      'wifiOff', 'signal', 'signalLow', 'router', 'cloudUpload', 'cloudDownload',
      'cloudOff', 'cloudCheck', 'cloudAlert', 'cloudSync', 'cloudX'
    ],
    datosIA: [
      'brain', 'brainCircuit', 'sparkAI', 'sparkles', 'robot', 'botHead', 'aiChip',
      'aiStars', 'aiFace', 'neuralNet', 'promptCursor', 'chatAI', 'dataFlow',
      'database', 'network', 'sitemap', 'radar', 'chartBar', 'chartLine',
      'chartArea', 'chartDonut', 'chartCandles', 'chartUp', 'chartDown',
      'chartMixed', 'chartRadar', 'pieChart', 'scatterChart', 'trendingUp',
      'trendingDown', 'activity', 'pulse', 'funnel', 'gauge', 'table', 'columns',
      'rows'
    ],
    seguridad: [
      'lock', 'unlock', 'lockHeart', 'lockClock', 'key', 'password', 'shield',
      'shieldOff', 'shieldAlert', 'shieldLock', 'shieldStar', 'shieldZap',
      'fingerprint', 'scanFace', 'eyeScan', 'safe', 'userShield', 'userLock',
      'incognito', 'cctv'
    ],
    clima: [
      'sun', 'moon', 'moonFull', 'moonStar', 'sunrise', 'sunset', 'cloud',
      'cloudRain', 'cloudSnow', 'cloudLightning', 'cloudFog', 'cloudSun',
      'cloudMoon', 'thermometer', 'wind', 'tornado', 'droplet', 'wave',
      'snowflake', 'rainbow', 'umbrella', 'mountain', 'tree', 'leaf', 'flower',
      'flame', 'planet', 'cactus', 'mushroom'
    ],
    transporte: [
      'car', 'bus', 'bike', 'train', 'plane', 'ship', 'sailboat', 'anchor',
      'truck', 'rocket', 'fuel', 'parking', 'route', 'navigation', 'compass',
      'map', 'trafficLight', 'steeringWheel', 'skateboard',
      'scooterElectric', 'motorbike', 'bikeElectric'
    ],
    lugares: [
      'mapPin', 'globe', 'building', 'buildings', 'factory', 'hospital', 'tent',
      'landmark', 'signpost', 'doorClosed', 'doorOpen', 'bridge', 'lighthouse'
    ],
    salud: [
      'heartPulse', 'pill', 'stethoscope', 'medicalCross', 'bandage', 'dumbbell',
      'run', 'sleep', 'bed', 'tooth', 'dna', 'wheelchair', 'glasses'
    ],
    comida: [
      'coffee', 'wine', 'pizza', 'utensils', 'apple', 'iceCream', 'cake', 'cookie',
      'burger', 'eggFried', 'candy', 'carrot', 'donut'
    ],
    educacion: [
      'book', 'bookOpen', 'bookHeart', 'graduationCap', 'notebook', 'pencil',
      'ruler', 'award', 'backpack', 'abacus', 'microscope'
    ],
    oficina: [
      'briefcase', 'presentation', 'print', 'calculator', 'idCard', 'lanyard',
      'paperclip', 'pin', 'scissors', 'stamp', 'pen', 'target', 'trophy', 'medal',
      'flag'
    ],
    tiempo: [
      'clock', 'clockAlert', 'clockCheck', 'clockPlus', 'watch', 'calendar',
      'calendarCheck', 'calendarPlus', 'calendarX', 'calendarDays',
      'calendarHeart', 'calendarStar', 'calendarClock', 'calendarMinus', 'alarm',
      'alarmPlus', 'timer', 'stopwatch', 'hourglass', 'history'
    ],
    cursores: [
      'cursorArrow', 'cursorClick', 'cursorPointer', 'cursorGrab', 'cursorGrabbing',
      'cursorText', 'cursorCrosshair', 'cursorMove', 'cursorCell', 'cursorResizeH',
      'cursorResizeV', 'cursorResizeDiag', 'cursorZoomIn', 'cursorZoomOut',
      'cursorDraw', 'cursorForbidden'
    ],
    formas: [
      'circle', 'square', 'triangle', 'pentagon', 'hexagon', 'octagon', 'rhombus',
      'squircle', 'diamond', 'star', 'starHalf', 'starCircle', 'starOff',
      'shootingStar', 'blob', 'asterisk', 'slash', 'dot', 'infinity'
    ],
    emociones: [
      'smile', 'smilePlus', 'laugh', 'grin', 'grinBig', 'joy', 'wink', 'meh',
      'frown', 'cry', 'angry', 'surprised', 'cool', 'heartEyes', 'tongue',
      'smirk', 'thinking', 'expressionless', 'rollingEyes', 'flushed', 'sleepy',
      'dizzy', 'starStruck', 'moneyFace', 'nerd', 'monocle', 'mask', 'sick',
      'hotFace', 'coldFace', 'scream', 'fearful', 'pleading', 'zany', 'shush',
      'drool', 'yawn', 'partyFace', 'angel', 'devilFace', 'upsideDown',
      'kissFace', 'catFace', 'handWave', 'handPeace', 'handOk', 'handPoint',
      'clap', 'muscle', 'pray', 'handFist', 'handHorns', 'hundred',
      'heartBroken', 'heartSparkle', 'balloon', 'partyPopper', 'bomb',
      'confetti', 'sunglasses', 'ghost', 'skull', 'sticker',
      'thoughtBubble', 'mindBlown', 'starEyes'
    ],
    electronica: [
      'pcTower', 'mouseDevice', 'keyboardKeys', 'monitorStand', 'ram', 'ssd',
      'usbStick', 'motherboard', 'circuitLines', 'powerCable', 'headset',
      'serverRack', 'routerWifi', 'smartwatchFace', 'plugPower',
      'databaseGear', 'databaseCheck', 'databasePlus', 'databaseZap',
      'batteryHalf', 'batteryEmpty', 'batteryDead', 'batteryWarning',
      'batteryBroken', 'signalFull', 'signalMid', 'signalNone',
      'plugOff', 'chipWarning', 'screenCracked', 'phoneCracked',
      'serverDown', 'cameraBroken'
    ],
    ventana: [
      'windowMinimize', 'windowMaximize', 'windowRestore', 'windowClose',
      'windowMode', 'windowSplit'
    ],
    notificaciones: [
      'bellAlert', 'bellX', 'notificationBadge', 'notificationOff'
    ],
    herramientas: [
      'hammer', 'screwdriver', 'drill', 'saw', 'toolBroken', 'chainBroken',
      'bulb', 'bulbOff'
    ],
    electrodomesticos: [
      'fridge', 'stove', 'microwave', 'blender', 'toaster', 'kettle',
      'washingMachine', 'airConditioner', 'fan', 'vacuum'
    ],
    musica: [
      'guitar', 'piano', 'drum'
    ],
    animales: [
      'paw', 'cat', 'dog', 'bird', 'butterfly', 'bee', 'turtle', 'rabbit',
      'snail', 'owl'
    ],
    hogar: [
      'tableFurniture', 'chairSeat', 'deskLamp', 'sofa', 'windowFrame',
      'shelfBooks', 'doorHandle', 'mirrorOval'
    ],
    personas: [
      'personStand', 'personWalk', 'personSit', 'personsPair', 'family', 'baby'
    ],
    cocina: [
      'breadLoaf', 'cheeseWedge', 'fishFood', 'salad', 'soupBowl',
      'sushiRoll', 'taco', 'bottleWater', 'beerMug', 'teaCup'
    ]
  };

  const categorized = new Set();
  Object.keys(categories).forEach(function (category) {
    categories[category].forEach(function (name) {
      if (!IconSet[name]) throw new Error('Dixel: icono desconocido en IconCategories -> ' + category + '.' + name);
      if (categorized.has(name)) throw new Error('Dixel: icono repetido en IconCategories -> ' + name);
      categorized.add(name);
    });
  });
  Object.keys(IconSet).forEach(function (name) {
    if (!categorized.has(name)) throw new Error('Dixel: icono sin categoria -> ' + name);
  });

  return categories;
});
