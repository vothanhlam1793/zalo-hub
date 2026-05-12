# PLAN1

## Muc Tieu Cua Tai Lieu Nay

Tai lieu nay dong vai tro la diem tiep noi cho session sau.

No ghi lai:

- hien trang he thong
- van de goc dang gap
- nhung gi da thu va ket qua
- ket luan ky thuat hien tai
- huong giai quyet moi dua tren source GitHub va implementation dang chay tren n8n

Muc tieu cho session tiep theo la co the tiep tuc truc tiep tu day, khong can phai dieu tra lai tu dau.

---

## 1. Hien Trang Kien Truc

He thong hien tai da duoc tach thanh 2 service:

1. `chat-server`
   - cong: `http://localhost:3199`
   - quan ly UI, channel logic, contacts, conversations, messages local

2. `zalo-service`
   - cong: `http://localhost:3299`
   - xu ly QR login, luu credential, reconnect, sync contacts

Scripts van hanh:

- `./start.sh`
- `./stop.sh`
- `./restart.sh`

Log files:

- `.run/logs/chat-server.log`
- `.run/logs/zalo-service.log`

Tai lieu kien truc da co trong repo:

- `ARCHITECTURE_V1.md`
- `CHATWOOT_FIT_GAP_V1.md`
- `DOMAIN_MODEL_V1.md`
- `EVENT_CONTRACTS_V1.md`
- `POSTGRES_SCHEMA_V1.md`
- `PLAN.md`

---

## 2. Flow San Pham Da Chot

Flow mong muon:

1. Tao channel
2. Yeu cau dang nhap Zalo
3. Lay QR
4. Quet QR
5. Dang nhap thanh cong
6. Co channel moi usable
7. Luu lai thong tin de server tu duy tri ket noi

UX mong muon:

- User chi thay 1 nut chinh: `Dang nhap Zalo`
- Khong bat user thay cac nut ky thuat nhu connect/reconnect
- Sau khi login thanh cong, server tu maintain session

---

## 3. Van De Goc Dang Gap

Van de quan trong nhat hien tai:

- UI co the bao `Dang nhap thanh cong`
- nhung session khong ben
- sau `F5` hoac sau khi session RAM mat di, channel roi ve `error`
- `Sync Contacts` tra `0` hoac fail

Ket luan:

- login hien tai chua phai `dang nhap thanh cong that su va ben vung`
- van de goc khong nam o UI
- khong nam o import contact cua `chat-server`
- nam o `session restore / reconnect` cua `zalo-service`

---

## 4. Bang Chung Ky Thuat Da Xac Nhan

### 4.1. Dau hieu o runtime

Da co luc channel hien `connected`, nhung sau do:

- `sync contact = 0`
- `F5` xong thanh `error`
- `lastError = Khong the khoi phuc session da luu`

### 4.2. Dau hieu o log

Trong `.run/logs/zalo-service.log` xuat hien lap lai:

```text
Cookie not in this host's domain
```

Cu the la cac cookie domain:

- `id.zalo.me`
- `zaloapp.com`
- `chat.zaloapp.com`
- `zalo.cx`
- `zalo.gg`

bi replay vao host khac nhu:

- `chat.zalo.me`
- `wpa.chat.zalo.me`

### 4.3. Phat hien tu source `zalo-api-final`

Research local source cho thay:

- `QR login` song thi co the thanh cong
- nhung `loginCookie / reconnect` replay cookies theo cach khong on
- `parseCookies(...)` trong dependency la diem dang nghi nhat

Ket qua:

- live QR flow co the pass
- restore session bang cookie luu lai rat de fail

### 4.4. IMEI / User Agent

Da xac nhan:

- flow dung phai giu du bo `cookie + imei + userAgent`
- session khong nen duoc xem la chi dua vao cookie

---

## 5. Nhung Gi Da Thu Trong Code Hien Tai

Da implement va thu cac huong sau trong `zalo-service`:

1. giu IMEI on dinh hon sau QR callback
2. sanitize cookie truoc reconnect
3. chi set `connected` sau khi verify session
4. `syncFriends()` normalize response shape
5. `chat-server` fallback import contact tu friend cache

Ket qua:

- co cai thien ve mat chan doan
- log ro hon
- UX ro hon
- nhung **khong giai quyet duoc van de goc**

Ly do:

- session reconnect van khong ben
- friend cache van rong
- `getAllFriends()` chua co bang chung la chay on trong he thong hien tai

---

## 6. Ket Luan Ky Thuat Hien Tai

Khong nen tiep tuc dau tu them vao wrapper hien tai dua tren `zalo-api-final` theo cach dang lam.

Vi:

1. session lifecycle dang yeu o dung phan kho nhat
2. reconnect bang cookie khong on dinh
3. `sync contact = 0` la he qua cua session khong usable
4. tiep tuc va wrapper se ton rat nhieu cong ma chua chac ra duoc ket qua on dinh

Noi ngan gon:

- implementation hien tai khong phai nen tang dang tin cay de di tiep

---

## 7. Phat Hien Moi Rat Quan Trong Tu N8N Cua Ban

Da truy cap duoc:

- `https://n8n.creta.vn`
- `https://n9n.creta.vn`

Bang tai khoan:

- `vothanhlam1793@gmail.com`
- da dang nhap duoc qua REST API

### 7.1. N8N dang co implementation Zalo chay that

Da tim thay workflow va credentials lien quan den Zalo.

Workflow dang chu y:

- `TEST-ZALO`
- `ZALO-ALTA-BRIDGE`
- `ZALO-ALTA-REPLY`

Node type tim thay:

- `n8n-nodes-zalos-user.zaloUser`
- `n8n-nodes-zalos-user.zaloMessageTrigger`

### 7.2. Credential shape trong n8n

Da xac nhan credential type `zaloApi` dang luu:

- `cookie`
- `imei`
- `userAgent`
- `licenseKey`

Dieu nay xac nhan huong dung:

- implementation dang chay o n8n khong chi dua vao cookie

### 7.3. Static data trigger

Trong workflow `ZALO-ALTA-BRIDGE`:

- `staticData.node:ZaloTrigger.isConnected = true`

Cho thay implementation tren n8n co trigger/session state rieng, va dang co kha nang chay duoc o muc nao do.

---

## 8. Repo GitHub Dung De Giai Bai Toan Nay

Repo da duoc xac minh la **khong trong**:

- `https://github.com/hiennguyen270995/n8n-nodes-zalo-ca-nhan`

Repo co:

- `credentials/`
- `nodes/`
- `docs/`
- `archived/`
- `package.json`
- `index.js`

README mo ta:

- package `n8n-nodes-zalo-ca-nhan`
- su dung `zalo-api-final@2.1.0`
- co cac node:
  - `Zalo Login By QR`
  - `Zalo User`
  - `Zalo Group`
  - `Zalo Send Message`
  - `Zalo Message Trigger`
  - `Zalo Friend Trigger`
  - `Zalo Poll`
  - `Zalo Tag`

Day la huong can bam vao cho session tiep theo.

---

## 9. Gia Thuyet Tot Nhat Hien Tai

Implementation Zalo dang chay thanh cong trong he thong n8n cua ban khong giong adapter hien tai trong repo nay.

No kha nang cao dang dua tren logic cua package:

- `n8n-nodes-zalo-ca-nhan`

hoac mot bien the custom cua package do.

Vi vay huong dung la:

- **khong va them adapter hien tai nua**
- **chuyen sang doc source cua package n8n nay**
- **port logic dang chay on sang `zalo-service` cua project**

---

## 10. Huong Giai Quyet De Xuat Cho Session Sau

### Huong chinh

Doc source package GitHub:

- `hiennguyen270995/n8n-nodes-zalo-ca-nhan`

Va tim chinh xac:

1. credential `zaloApi`
2. node login QR
3. trigger node
4. user node `getAllFriends`
5. co che persist session
6. co che reconnect/keep-alive neu co

### Muc tieu implementation

Khong can dua n8n vao project nay.

Muc tieu la:

- trich xuat logic Zalo dang chay on
- wrap lai thanh `zalo-service` doc lap cho kien truc hien tai

---

## 11. Cong Viec Cu The Can Lam O Session Sau

### Buoc 1. Clone/Doc source GitHub

Doc chi tiet cac file trong repo:

- `credentials/*`
- `nodes/*`
- `index.js`
- `package.json`

Can tim:

- login QR node nam o dau
- user node `getAllFriends` nam o dau
- trigger node connect session the nao

### Buoc 2. So sanh voi implementation hien tai

Lap bang so sanh:

- project hien tai
- `n8n-nodes-zalo-ca-nhan`

Can chi ro:

- cho nao khac nhau trong login
- cho nao khac nhau trong session restore
- cho nao khac nhau trong trigger/listen
- cho nao khac nhau trong friend sync

### Buoc 3. Chon cach tai su dung

Co 2 huong:

1. port logic tu package sang `src/zalo-service/*`
2. hoac tao 1 adapter moi ben trong `zalo-service` dua tren package do

### Buoc 4. Uu tien testcase truoc tien

Sau khi port logic, phai kiem tra toi thieu 4 bai test:

1. QR login
2. F5 / restart van giu duoc trang thai
3. get friends > 0 neu account co ban be
4. trigger nhan message den

---

## 12. Nhung Dieu Khong Nen Lam Tiep O Session Sau

1. khong tiep tuc sua UI nho le neu chua sua adapter goc
2. khong tiep tuc va `syncFriends()` cua implementation cu ma khong doi adapter
3. khong tiep tuc tin vao trang thai `connected` neu no van den tu adapter cu

---

## 13. Cac URL / Thong Tin Da Duoc Xac Minh

### GitHub repo

- `https://github.com/hiennguyen270995/n8n-nodes-zalo-ca-nhan`

### N8N hosts

- `https://n8n.creta.vn`
- `https://n9n.creta.vn`

### Workflow dang chu y tren n9n

- `8GQsEkmCNWfuKUeI` -> `TEST-ZALO`
- `kknQpeayGvtXilVs` -> `ZALO-ALTA-BRIDGE`

### Credential dang chu y tren n8n

Loai:

- `zaloApi`
- `n8nZaloApi`

---

## 14. Chot Lai Cho Session Sau

Tinh than dung cho session tiep theo:

1. Thua nhan implementation hien tai cua `zalo-service` khong du on dinh
2. Su dung `PLAN1.md` lam diem bat dau
3. Chuyen huong sang doc source `n8n-nodes-zalo-ca-nhan`
4. Muc tieu khong phai la fix tiep implementation cu
5. Muc tieu la thay logic Zalo bang implementation gan voi he thong n8n dang chay duoc cua ban

Noi ngan gon:

- **Bo huong va adapter hien tai sang mot ben**
- **Bam vao package GitHub Zalo node cua n8n**
- **Port logic do vao `zalo-service`**
