const CONFIG = {
  WIDTH: 576,
  FONT_FAMILY: 'sans-serif',
  LINE_HEIGHT: 1.5,
  SPACING_AFTER: 10,
  MARGINS: {
    LEFT: 0,
    RIGHT: 5,
  },
  HEADER: {
    FONT_SIZE: 30,
    FONT_STYLE: 'bold',
  },
  INFO: {
    FONT_SIZE: 25,
  },
  PAGE: {
    FONT_SIZE: 25,
  },
  TABLE: {
    FONT_SIZE: 25,
    FONT_STYLE: 'bold',
    COLUMNS: {
      NAME: 0,
      QTY: 300,
      PRICE: 430,
      TOTAL: 566,
    },
    KITCHEN_COLUMNS: {
      NAME: 0,
      QTY: 566,
    },
    NAME_PADDING: 15,
    SPACING_AFTER: 5,
  },
  TOTAL: {
    FONT_SIZE: 30,
    FONT_STYLE: 'bold',
    SPACING_AFTER: 20,
  },
  HR: {
    HEIGHT: 2,
    SPACING_AFTER: 10,
  },
};

const HEIGHT = {
  HEADER: CONFIG.HEADER.FONT_SIZE * CONFIG.LINE_HEIGHT,
  INFO: CONFIG.INFO.FONT_SIZE * CONFIG.LINE_HEIGHT,
  PAGE: CONFIG.PAGE.FONT_SIZE * CONFIG.LINE_HEIGHT,
  TABLE_ROW: CONFIG.TABLE.FONT_SIZE * CONFIG.LINE_HEIGHT,
  TOTAL: CONFIG.TOTAL.FONT_SIZE * CONFIG.LINE_HEIGHT,
  HR: CONFIG.HR.HEIGHT,
};

const LINE_WIDTH = CONFIG.WIDTH - CONFIG.MARGINS.LEFT - CONFIG.MARGINS.RIGHT;

module.exports = {
  CONFIG,
  HEIGHT,
  LINE_WIDTH,
};
