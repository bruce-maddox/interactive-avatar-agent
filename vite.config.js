export default {
  server: {
    // `npm run dev` only: forward API calls to the token server on :3000.
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
};
