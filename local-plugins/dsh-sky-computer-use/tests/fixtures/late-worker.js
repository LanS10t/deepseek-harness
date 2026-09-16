process.on('message', message => {
  if (message.type === 'initialize') process.send({ id: message.id, ok: true, value: {} });
  if (message.type === 'call') {
    setTimeout(() => process.send({ id: message.id, ok: true, value: 'late-success' }), 80);
  }
  if (message.type === 'close') {
    setTimeout(() => {
      process.send({ type: 'closed' }, () => process.disconnect());
    }, 150);
  }
});
