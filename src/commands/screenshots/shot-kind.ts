/**
 * The custom-id kind of the controls about a screenshot (`screenshotControls`). With a
 * screenshot's id (12 characters): `shot:<id>:right` ("All right"), `shot:<id>:wrong`
 * ("Something is wrong", which opens the form `shot:<id>:form`) and `shot:<id>:show` (the
 * reporter's "Screenshot feedback", which shows the screenshot and what was read). With the
 * token of a pending question (`PendingRequests`, 16 characters): the question about the gym of
 * a screenshot posted with a mention of the bot, `shot:<token>:gym` (the menu) and
 * `shot:<token>:cancel`; the question of a passive reading whether to report a clear gym of
 * another region there, `shot:<token>:yes` and `shot:<token>:cancel` (No).
 */
export const SHOT_KIND = 'shot';
