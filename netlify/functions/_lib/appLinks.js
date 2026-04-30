const APP_LINKS = {
  android: {
    employee: {
      url: "https://play.google.com/apps/internaltest/4701244117919733299",
      label: "Android – Shift Seeker",
    },
    employer: {
      url: "https://play.google.com/apps/internaltest/4700935281386516321",
      label: "Android – Business",
    },
  },
  ios: {
    employee: {
      url: "https://testflight.apple.com/join/hUTzGr2L",
      label: "iOS – Shift Seeker",
    },
    employer: {
      url: "https://testflight.apple.com/join/g7Qp7977",
      label: "iOS – Business",
    },
  },
};

function getAppLink(platform, role) {
  return APP_LINKS[platform]?.[role] || null;
}

module.exports = { getAppLink, APP_LINKS };
