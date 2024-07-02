class PagedConfig {
  auto = false;

  constructor(wait) {
    this.mermaidResolvers = Promise.withResolvers();
    if (wait)
      this.buttonResolvers = Promise.withResolvers();
  }

  async before() {
    const main = document.querySelector('main');
    console.log(this);
    await Promise.all([
      this.mermaidResolvers.promise,
      this.buttonResolvers?.promise,
    ]);
    console.log('Replacing', main);
    main && document.body.replaceChildren(main);
  }

  // eslint-disable-next-line class-methods-use-this
  after(flow) {
    console.log('after', flow);
  }
}

window.PagedConfig = new PagedConfig(!navigator.webdriver);
