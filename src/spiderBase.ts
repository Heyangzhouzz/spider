import axios, {AxiosInstance,AxiosRequestConfig} from 'axios';
import fs,{access,constants,readFile} from 'fs';
import path from 'path';
import os from 'os';
import PQueue from 'p-queue';

const queue = new PQueue({concurrency: 10});
const goodsqueue = new PQueue({concurrency: 10});

declare module 'axios' {

  export interface AxiosRequestConfig {
    retry?: number;
    retryDelay?: number;
  }
} 

export class Spider {
  private axios:AxiosInstance;
  private goodsCount = 0;
  private cateCount = 0;
  private goodsImgRequestList:any[] = [];
  constructor() {
    this.axios = axios.create({
      retry: 2,
      retryDelay: 1000,
      headers: {
        'Cache-Control': 'no-cache',
        'If-Modified-Since': '0',
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 10_3_1 like Mac OS X) AppleWebKit/603.1.30 (KHTML, like Gecko) Version/10.0 Mobile/14E304 Safari/602.1 Edg/98.0.4758.102',
        'Referer': 'https://mall.cheersofa.com/mobile',
        'Host': 'mall.cheersofa.com',
      },
    });
    this.axios.interceptors.response.use(undefined, (err) => {
      var config = err.config;
      // 如果配置不存在或未设置重试选项，则拒绝
      if (!config || !config.retry) return Promise.reject(err);

      // 设置变量以跟踪重试次数
      config.__retryCount = config.__retryCount || 0;

      // 判断是否超过总重试次数
      if (config.__retryCount >= config.retry) {
          // 返回错误并退出自动重试
          return Promise.reject(err);
      }

      // 增加重试次数
      config.__retryCount += 1;

      //打印当前重试次数
      console.log(config.url +' 自动重试第' + config.__retryCount + '次');
      // 创建新的Promise
        var backoff = new Promise(function (resolve) {
          setTimeout(function () {
              resolve(true);
          }, config.retryDelay || 1);
      });

      // 返回重试请求
      return backoff.then(function () {
          return axios(config);
      });

    })
  }

  async getSerList() {
    const result = await this.axios.request({
      url: 'https://mall.cheersofa.com/api/catalog/list',
      method: 'GET',
    });
    if (result.data?.data?.length) {
      await this.spidSerList(result.data.data);
    }
  }

  async getCataList(id:string) {
    const result = await this.axios.request({
      url: `https://mall.cheersofa.com/api/catalog/list/${id}`,
      method: 'GET',
    });
    if (result.data?.data?.length && result.data?.data[0]?.child?.length) {
      await this.spiderCataList(result.data?.data[0]?.child, result.data?.data[0].cat_name);
    }
  }
  async getGoodsList(id: string, cataDir: string) {
    const result = await this.axios.request({
      url: `https://mall.cheersofa.com/api/catalog/goodslist`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      data: `cat_id=${id}&warehouse_id=0&area_id=0&min=&max=&ext=&goods_num=0&size=10&page=1&sort=goods_id&order=desc&self=0&intro=`,
    });
    if (result.data?.data?.length) {
      await this.spiderGoodsList(result.data?.data, cataDir );
    }
  }

  async spiderGoodsList(list: any[], cataDir: string) {
    for (const goods of list) {
      const goodsDir = `${cataDir}/${goods.goods_name}`;
      goodsqueue.add(() => this.spiderGood(goods.goods_id, goodsDir));
      // await this.spiderGood(goods.goods_id, goodsDir);
    }
  }

  spiderGood(id:string, goodsDir:string) {
    return new Promise((resolve) => {
      const EOL = os.EOL;
      access(`${goodsDir}/商品信息.txt`, constants.F_OK, (err) => {
        if (err) {
          fs.mkdir(goodsDir, {recursive: true}, (err) => {
            if (err) {
              throw err;
            };
            this.axios.request({
              url: `https://mall.cheersofa.com/api/goods/show`,
              method: 'POST',
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
              },
              data: `goods_id=${id}&warehouse_id=0&area_id=0&is_delete=0&is_on_sale=1&parent_id=`,
            }).then((response:any) => {
              const detail = response.data?.data;
              if (detail?.gallery_list?.length) {
                this.goodsCount ++;
                console.log( this.goodsCount + ':'+detail?.goods_name + '下载中');
                detail?.gallery_list.forEach((item:any) => {
                  const url = item.img_url;
                  if (url) {
                    this.goodsImgRequestList.push({
                      url,
                      dest: `${goodsDir}/${url.split('/').pop()}`,
                    });
                  }
                });
              }
              let info = '';
              if (detail?.goods_name) {
                info += `商品名称：${detail?.goods_name}${EOL}`;
              }
              if (detail?.goods_sn) {
                info += `商品编号：${detail?.goods_sn}${EOL}`;
              }
              if (detail?.shop_price) {
                info += `商品售价：${detail?.shop_price}${EOL}`;
              }
              if (detail?.market_price) {
                info += `商品原价：${detail?.market_price}${EOL}`;
              }
              if (detail?.gallery_list) {
                info += `商品图片：${detail?.gallery_list.map((item:any)=>item.img_url).toString()}${EOL}`;
              }
              fs.writeFile(`${goodsDir}/商品信息.txt`, info, (err) => {
                if (err) throw err;
              });
              resolve(true);
            }).catch((e) => {
              console.log(e);
              resolve(true);
            });
          });
        } else {
          readFile(`${goodsDir}/商品信息.txt`, { encoding: 'utf8' }, (err,data) => {
            if (!err) {
              const img_urls:any = data?.split(EOL)?.find(item=>item.includes('商品图片：'))?.slice(5)?.split(',')
              if (img_urls?.length) {
                img_urls.forEach((url: string) => {
                  this.goodsImgRequestList.push({
                    url,
                    dest: `${goodsDir}/${url.split('/').pop()}`,
                  });
                })
              }
            }
            resolve(true);
          })
        }
      });
    });
  }

  async spiderCataList(list: any[], serName:string) {
    const serDir = path.join(__dirname, `pkg/${serName}`);
    for (const item of list) {
      const cataDir = `${serDir}/${item.cat_name}`;
      this.cateCount++;
      console.log('正在爬取第'+ this.cateCount +'个品类');
      await new Promise((resolve) => {
        fs.mkdir(cataDir, {recursive: true}, (err) => {
          if (err) {
            throw err;
          };
          if (item.touch_icon) {
            this.downloadImg(item.touch_icon, `${cataDir}/品类icon.${item.touch_icon.split('.').pop()}`);
          }
          this.getGoodsList(item.cat_id, cataDir).then(() => {
            resolve(true);
          }).catch((err) => {
            console.error(err);
            resolve(true);
          });
        });
      });
    }
  }

  async downloadImg(url: string, path: string) {
    return new Promise((resolve) => {
      access(path, constants.F_OK, (err) => {
        if (err) {
          axios({
            url,
            responseType: 'stream',
          }).then((res) => {
            res.data.pipe(fs.createWriteStream(path)).on('close', () => {
              console.log(`${path.split('/').pop()}下载完毕`)
              resolve(true);
            });
          }).catch(err => {
            console.log(err)
            resolve(true);
          });
        } else {
          resolve(true);
        }
      })
    })
  }


  async spidSerList(list: any[]) {
    for (const item of list) {
      const serDir = path.join(__dirname, `pkg/${item.cat_name}`);
      await new Promise((resolve) => {
        fs.mkdir(serDir, {recursive: true}, (err) => {
          if (err) {
            throw err;
          };
          if (item.touch_catads) {
            this.downloadImg(item.touch_catads, `${serDir}/系列头图.${item.touch_catads.split('.').pop()}`);
          }
          this.getCataList(item.cat_id).then(() => {
            resolve(true);
          }).catch((err) => {
            console.error(err);
            resolve(true);
          });
        });
      });
    }
  }

  async downloadGoodImgs() {
    this.goodsImgRequestList.forEach(async (item:any, index:any) => {
      await queue.add(() => this.downloadImg(item.url, item.dest));
    });
  }

  async run() {
    await this.getSerList();
    goodsqueue.on('idle', () => {
      console.log('商品目录创建完毕开始下载商品图片');
      console.log(`共${this.goodsImgRequestList.length}张图片需下载请耐心等待`);
      this.downloadGoodImgs();
    })
    let count = 0;
    queue.on('active', () => {
      console.log(`Working on item #${++count}.  Size: ${queue.size}  Pending: ${queue.pending}`);
    })
  }
}
