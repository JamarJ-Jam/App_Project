export const bootstrapTrace = (message) => {
    if (process.env.NODE_ENV !== 'production') {
        console.log(`[BOOTSTRAP_TRACE] ${message}`);
    }
};
