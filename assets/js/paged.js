class PagedConfig {
  auto = false;

  constructor(wait) {
    wait && Object.assign(this, Promise.withResolvers());
  }

  async before() {
    console.log('before');
    await this.promise;
    const main = document.querySelector('main');
    main && document.body.replaceChildren(main);
  }

  // eslint-disable-next-line class-methods-use-this
  after(flow) {
    console.log('after', flow);
  }
}

window.PagedConfig = new PagedConfig(!navigator.webdriver);
