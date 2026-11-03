// 自定义脚本示例：全局 log/sleep 直接可用；ctx 注入 data / context
return async (ctx) => {
    log.info("自定义脚本开始执行，note: {note}", ctx.data && ctx.data.note);
    await sleep(300);
    log.info("自定义脚本执行结束");
};
