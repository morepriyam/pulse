module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // Inline Drizzle's .sql migration files so they bundle into the JS.
    plugins: [['inline-import', { extensions: ['.sql'] }]],
  };
};
