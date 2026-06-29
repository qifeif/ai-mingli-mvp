/**
 * 出生地经度查表(MVP 用内置主要城市表;生产建议接地理编码 API,
 * 如高德/Google Geocoding,把任意地名解析为经纬度)。
 * 东经为正。
 */
export const CITY_LONGITUDE = {
  北京: 116.41,
  上海: 121.47,
  广州: 113.26,
  深圳: 114.06,
  杭州: 120.15,
  南京: 118.78,
  成都: 104.07,
  重庆: 106.55,
  武汉: 114.30,
  西安: 108.94,
  郑州: 113.62,
  长沙: 112.94,
  沈阳: 123.43,
  哈尔滨: 126.53,
  乌鲁木齐: 87.62, // 注意:新疆与北京时间差极大,真太阳时校正尤其重要
  拉萨: 91.14,
  昆明: 102.83,
  兰州: 103.83,
  济南: 117.00,
  天津: 117.20,
  福州: 119.30,
  厦门: 118.10,
  青岛: 120.38,
};

/** 解析出生地 → 经度。查不到时返回 null,调用方应要求用户提供经度或退回 120。 */
export function resolveLongitude(place) {
  if (typeof place === 'number') return place; // 已是经度
  if (!place) return null;
  for (const [name, lon] of Object.entries(CITY_LONGITUDE)) {
    if (place.includes(name)) return lon;
  }
  return null;
}
