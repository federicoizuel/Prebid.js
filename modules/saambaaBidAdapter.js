import {deepAccess, generateUUID, isEmpty, isFn, parseSizesInput, parseUrl} from '../src/utils.js';
import {config} from '../src/config.js';
import {registerBidder} from '../src/adapters/bidderFactory.js';
import {BANNER, VIDEO} from '../src/mediaTypes.js';
import {find, includes} from '../src/polyfill.js';

const ADAPTER_VERSION = '1.0';
const BIDDER_CODE = 'saambaa';

export const VIDEO_ENDPOINT = 'https://nep.advangelists.com/xp/get?pubid=';
export const BANNER_ENDPOINT = 'https://nep.advangelists.com/xp/get?pubid=';
export const OUTSTREAM_SRC = 'https://player-cdn.beachfrontmedia.com/playerapi/loader/outstream.js';
export const VIDEO_TARGETING = ['mimes', 'playbackmethod', 'maxduration', 'skip', 'playerSize', 'context'];
export const DEFAULT_MIMES = ['video/mp4', 'application/javascript'];

let pubid = '';

export const spec = {
  code: BIDDER_CODE,
  supportedMediaTypes: [BANNER, VIDEO],

  isBidRequestValid(bidRequest) {
    if (typeof bidRequest != 'undefined') {
      if (bidRequest.bidder !== BIDDER_CODE && typeof bidRequest.params === 'undefined') { return false; }
      if (bidRequest === '' || bidRequest.params.placement === '' || bidRequest.params.pubid === '') { return false; }
      return true;
    } else { return false; }
  },

  buildRequests(bids, bidderRequest) {
    let requests = [];
    let videoBids = bids.filter(bid => isVideoBidValid(bid));
    let bannerBids = bids.filter(bid => isBannerBidValid(bid));
    videoBids.forEach(bid => {
      pubid = getVideoBidParam(bid, 'pubid');
      requests.push({
        method: 'POST',
        url: VIDEO_ENDPOINT + pubid,
        data: createVideoRequestData(bid, bidderRequest),
        bidRequest: bid
      });
    });

    bannerBids.forEach(bid => {
      pubid = getBannerBidParam(bid, 'pubid');

      requests.push({
        method: 'POST',
        url: BANNER_ENDPOINT + pubid,
        data: createBannerRequestData(bid, bidderRequest),
        bidRequest: bid
      });
    });
    return requests;
  },

  interpretResponse(serverResponse, {bidRequest}) {
    let response = serverResponse.body;
    if (response !== null && isEmpty(response) == false) {
      if (isVideoBid(bidRequest)) {
        let bidResponse = {
          requestId: response.id,
          bidderCode: BIDDER_CODE,
          cpm: response.seatbid[0].bid[0].price,
          width: response.seatbid[0].bid[0].w,
          height: response.seatbid[0].bid[0].h,
          ttl: response.seatbid[0].bid[0].ttl || 60,
          creativeId: response.seatbid[0].bid[0].crid,
          currency: response.cur,
          meta: { 'advertiserDomains': response.seatbid[0].bid[0].adomain },
          mediaType: VIDEO,
          netRevenue: true
        }

        if (response.seatbid[0].bid[0].adm) {
          bidResponse.vastXml = response.seatbid[0].bid[0].adm;
          bidResponse.adResponse = {
            content: response.seatbid[0].bid[0].adm
          };
        } else {
          bidResponse.vastUrl = response.seatbid[0].bid[0].nurl;
        }

        return bidResponse;
      } else {
        return {
          requestId: response.id,
          bidderCode: BIDDER_CODE,
          cpm: response.seatbid[0].bid[0].price,
          width: response.seatbid[0].bid[0].w,
          height: response.seatbid[0].bid[0].h,
          ad: response.seatbid[0].bid[0].adm,
          ttl: response.seatbid[0].bid[0].ttl || 60,
          creativeId: response.seatbid[0].bid[0].crid,
          currency: response.cur,
          meta: { 'advertiserDomains': response.seatbid[0].bid[0].adomain },
          mediaType: BANNER,
          netRevenue: true
        }
      }
    }
  }
};

function isBannerBid(bid) {
  return deepAccess(bid, 'mediaTypes.banner') || !isVideoBid(bid);
}

function isVideoBid(bid) {
  return deepAccess(bid, 'mediaTypes.video');
}

function getBannerBidFloor(bid) {
  let floorInfo = isFn(bid.getFloor) ? bid.getFloor({ currency: 'USD', mediaType: 'banner', size: '*' }) : {};
  return floorInfo.floor || getBannerBidParam(bid, 'bidfloor');
}

function getVideoBidFloor(bid) {
  let floorInfo = isFn(bid.getFloor) ? bid.getFloor({ currency: 'USD', mediaType: 'video', size: '*' }) : {};
  return floorInfo.floor || getVideoBidParam(bid, 'bidfloor');
}

function isVideoBidValid(bid) {
  return isVideoBid(bid) && getVideoBidParam(bid, 'pubid') && getVideoBidParam(bid, 'placement');
}

function isBannerBidValid(bid) {
  return isBannerBid(bid) && getBannerBidParam(bid, 'pubid') && getBannerBidParam(bid, 'placement');
}

function getVideoBidParam(bid, key) {
  return deepAccess(bid, 'params.video.' + key) || deepAccess(bid, 'params.' + key);
}

function getBannerBidParam(bid, key) {
  return deepAccess(bid, 'params.banner.' + key) || deepAccess(bid, 'params.' + key);
}

function isMobile() {
  return (/(ios|ipod|ipad|iphone|android)/i).test(navigator.userAgent);
}

function isConnectedTV() {
  return (/(smart[-]?tv|hbbtv|appletv|googletv|hdmi|netcast\.tv|viera|nettv|roku|\bdtv\b|sonydtv|inettvbrowser|\btv\b)/i).test(navigator.userAgent);
}

function getDoNotTrack() {
  return navigator.doNotTrack === '1' || window.doNotTrack === '1' || navigator.msDoNoTrack === '1' || navigator.doNotTrack === 'yes';
}

function findAndFillParam(o, key, value) {
  try {
    if (typeof value === 'function') {
      o[key] = value();
    } else {
      o[key] = value;
    }
  } catch (ex) {}
}

function getOsVersion() {
  let clientStrings = [
    { s: 'Android', r: /Android/ },
    { s: 'iOS', r: /(iPhone|iPad|iPod)/ },
    { s: 'Mac OS X', r: /Mac OS X/ },
    { s: 'Mac OS', r: /(MacPPC|MacIntel|Mac_PowerPC|Macintosh)/ },
    { s: 'Linux', r: /(Linux|X11)/ },
    { s: 'Windows 10', r: /(Windows 10.0|Windows NT 10.0)/ },
    { s: 'Windows 8.1', r: /(Windows 8.1|Windows NT 6.3)/ },
    { s: 'Windows 8', r: /(Windows 8|Windows NT 6.2)/ },
    { s: 'Windows 7', r: /(Windows 7|Windows NT 6.1)/ },
    { s: 'Windows Vista', r: /Windows NT 6.0/ },
    { s: 'Windows Server 2003', r: /Windows NT 5.2/ },
    { s: 'Windows XP', r: /(Windows NT 5.1|Windows XP)/ },
    { s: 'UNIX', r: /UNIX/ },
    { s: 'Search Bot', r: /(nuhk|Googlebot|Yammybot|Openbot|Slurp|MSNBot|Ask Jeeves\/Teoma|ia_archiver)/ }
  ];
  let cs = find(clientStrings, cs => cs.r.test(navigator.userAgent));
  return cs ? cs.s : 'unknown';
}

function getFirstSize(sizes) {
  return (sizes && sizes.length) ? sizes[0] : { w: undefined, h: undefined };
}

function parseSizes(sizes) {
  return parseSizesInput(sizes).map(size => {
    let [ width, height ] = size.split('x');
    return {
      w: parseInt(width, 10) || undefined,
      h: parseInt(height, 10) || undefined
    };
  });
}

function getVideoSizes(bid) {
  return parseSizes(deepAccess(bid, 'mediaTypes.video.playerSize') || bid.sizes);
}

function getBannerSizes(bid) {
  return parseSizes(deepAccess(bid, 'mediaTypes.banner.sizes') || bid.sizes);
}

function getTopWindowReferrer() {
  try {
    return window.top.document.referrer;
  } catch (e) {
    return '';
  }
}

function getVideoTargetingParams(bid) {
  const result = {};
  const excludeProps = ['playerSize', 'context', 'w', 'h'];
  Object.keys(Object(bid.mediaTypes.video))
    .filter(key => !includes(excludeProps, key))
    .forEach(key => {
      result[ key ] = bid.mediaTypes.video[ key ];
    });
  Object.keys(Object(bid.params.video))
    .filter(key => includes(VIDEO_TARGETING, key))
    .forEach(key => {
      result[ key ] = bid.params.video[ key ];
    });
  return result;
}

function createVideoRequestData(bid, bidderRequest) {
  let topLocation = getTopWindowLocation(bidderRequest);
  let topReferrer = getTopWindowReferrer();

  // if size is explicitly given via adapter params
  let paramSize = getVideoBidParam(bid, 'size');
  let sizes = [];
  let coppa = config.getConfig('coppa');

  if (typeof paramSize !== 'undefined' && paramSize != '') {
    sizes = parseSizes(paramSize);
  } else {
    sizes = getVideoSizes(bid);
  }
  const firstSize = getFirstSize(sizes);
  let floor = (getVideoBidFloor(bid) == null || typeof getVideoBidFloor(bid) == 'undefined') ? 0.5 : getVideoBidFloor(bid);
  let video = getVideoTargetingParams(bid);
  const o = {
    'device': {
      'langauge': (global.navigator.language).split('-')[0],
      'dnt': (global.navigator.doNotTrack === 1 ? 1 : 0),
      'devicetype': isMobile() ? 4 : isConnectedTV() ? 3 : 2,
      'js': 1,
      'os': getOsVersion()
    },
    'at': 2,
    'site': {},
    'tmax': 3000,
    'cur': ['USD'],
    'id': bid.bidId,
    'imp': [],
    'regs': {
      'ext': {
      }
    },
    'user': {
      'ext': {
      }
    }
  };

  o.site['page'] = topLocation.href;
  o.site['domain'] = topLocation.hostname;
  o.site['search'] = topLocation.search;
  o.site['domain'] = topLocation.hostname;
  o.site['ref'] = topReferrer;
  o.site['mobile'] = isMobile() ? 1 : 0;
  const secure = topLocation.protocol.indexOf('https') === 0 ? 1 : 0;

  o.device['dnt'] = getDoNotTrack() ? 1 : 0;

  findAndFillParam(o.site, 'name', function() {
    return global.top.document.title;
  });

  findAndFillParam(o.device, 'h', function() {
    return global.screen.height;
  });
  findAndFillParam(o.device, 'w', function() {
    return global.screen.width;
  });

  let placement = getVideoBidParam(bid, 'placement');

  for (let j = 0; j < sizes.length; j++) {
    o.imp.push({
      'id': '' + j,
      'displaymanager': '' + BIDDER_CODE,
      'displaymanagerver': '' + ADAPTER_VERSION,
      'tagId': placement,
      'bidfloor': floor,
      'bidfloorcur': 'USD',
      'secure': secure,
      'video': Object.assign({
        'id': generateUUID(),
        'pos': 0,
        'w': firstSize.w,
        'h': firstSize.h,
        'mimes': DEFAULT_MIMES
      }, video)

    });
  }
  if (coppa) {
    o.regs.ext = {'coppa': 1};
  }
  if (bidderRequest && bidderRequest.gdprConsent) {
    let { gdprApplies, consentString } = bidderRequest.gdprConsent;
    o.regs.ext = {'gdpr': gdprApplies ? 1 : 0};
    o.user.ext = {'consent': consentString};
  }

  return o;
}

function getTopWindowLocation(bidderRequest) {
  let url = bidderRequest && bidderRequest.refererInfo && bidderRequest.refererInfo.referer;
  return parseUrl(config.getConfig('pageUrl') || url, { decodeSearchAsString: true });
}

function createBannerRequestData(bid, bidderRequest) {
  let topLocation = getTopWindowLocation(bidderRequest);
  let topReferrer = getTopWindowReferrer();

  // if size is explicitly given via adapter params

  let paramSize = getBannerBidParam(bid, 'size');
  let sizes = [];
  let coppa = config.getConfig('coppa');
  if (typeof paramSize !== 'undefined' && paramSize != '') {
    sizes = parseSizes(paramSize);
  } else {
    sizes = getBannerSizes(bid);
  }

  let floor = (getBannerBidFloor(bid) == null || typeof getBannerBidFloor(bid) == 'undefined') ? 0.1 : getBannerBidFloor(bid);
  const o = {
    'device': {
      'langauge': (global.navigator.language).split('-')[0],
      'dnt': (global.navigator.doNotTrack === 1 ? 1 : 0),
      'devicetype': isMobile() ? 4 : isConnectedTV() ? 3 : 2,
      'js': 1
    },
    'at': 2,
    'site': {},
    'tmax': 3000,
    'cur': ['USD'],
    'id': bid.bidId,
    'imp': [],
    'regs': {
      'ext': {
      }
    },
    'user': {
      'ext': {
      }
    }
  };

  o.site['page'] = topLocation.href;
  o.site['domain'] = topLocation.hostname;
  o.site['search'] = topLocation.search;
  o.site['domain'] = topLocation.hostname;
  o.site['ref'] = topReferrer;
  o.site['mobile'] = isMobile() ? 1 : 0;
  const secure = topLocation.protocol.indexOf('https') === 0 ? 1 : 0;

  o.device['dnt'] = getDoNotTrack() ? 1 : 0;

  findAndFillParam(o.site, 'name', function() {
    return global.top.document.title;
  });

  findAndFillParam(o.device, 'h', function() {
    return global.screen.height;
  });
  findAndFillParam(o.device, 'w', function() {
    return global.screen.width;
  });

  let placement = getBannerBidParam(bid, 'placement');
  for (let j = 0; j < sizes.length; j++) {
    let size = sizes[j];

    o.imp.push({
      'id': '' + j,
      'displaymanager': '' + BIDDER_CODE,
      'displaymanagerver': '' + ADAPTER_VERSION,
      'tagId': placement,
      'bidfloor': floor,
      'bidfloorcur': 'USD',
      'secure': secure,
      'banner': {
        'id': generateUUID(),
        'pos': 0,
        'w': size['w'],
        'h': size['h']
      }
    });
  }
  if (coppa) {
    o.regs.ext = {'coppa': 1};
  }
  if (bidderRequest && bidderRequest.gdprConsent) {
    let { gdprApplies, consentString } = bidderRequest.gdprConsent;
    o.regs.ext = {'gdpr': gdprApplies ? 1 : 0};
    o.user.ext = {'consent': consentString};
  }

  return o;
}
registerBidder(spec);
