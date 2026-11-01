/**
 * A thread that never answers, for the tests of `SaveCheckWorker`: it stands for a check that
 * takes far longer than it may, and stays until it is ended.
 */
setInterval(() => undefined, 60_000);
