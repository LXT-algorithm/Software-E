// 全局配置和状态变量
const AMAP_KEY = window.APP_CONFIG.AMAP_KEY;

let currentUser = null;
let isSending = false;
let abortController = null;
let autoScrollEnabled = true;
let isDarkMode = localStorage.getItem('darkMode') === 'true';

let currentPage = 1, currentKeyword = "", currentCity = "";

// 高德地图对象
let geocoder = null;