# Link_in

카테고리별로 링크(주소, 사이트 이름, 이미지, 설명)를 저장하는 크롬 확장 + 로컬 MySQL 백엔드입니다.

## 필요한 것

- Node.js
- 로컬 MySQL 서버 (DB: `link`, 사용자: root, 비밀번호: 1234)

## 실행 방법

### 1. MySQL 실행

로컬에서 MySQL 서비스가 켜져 있어야 합니다.  
최초 실행 시 `link` DB와 테이블(`categories`, `links`)이 자동 생성됩니다.

### 2. 백엔드 서버 실행

```bash
cd c:\Users\ETK_302\Desktop\개인개발\link
npm install
npm start
```

브라우저에서 `http://localhost:3000` 이 아닌, **확장 프로그램 팝업**에서만 사용합니다.

### 3. 크롬 확장 프로그램 설치

1. Chrome 주소창에 `chrome://extensions` 입력
2. 우측 상단 **개발자 모드** 켜기
3. **압축해제된 확장 프로그램을 로드합니다** 클릭
4. 폴더 `c:\Users\ETK_302\Desktop\개인개발\link` 선택

이후 툴바의 Link_in 아이콘을 클릭하면 팝업에서 카테고리/링크를 관리할 수 있습니다.

## DB 설정 (선택)

다른 값을 쓰려면 실행 전에 환경변수로 덮을 수 있습니다.

- `DB_HOST` (기본: localhost)
- `DB_USER` (기본: root)
- `DB_PASSWORD` (기본: 1234)
- DB 이름은 코드에서 `link`로 고정

## 링크 데이터 구조

- **주소 URL** (필수)
- **사이트 이름** (필수)
- **사이트 이미지** (선택) – favicon 또는 로고 URL
- **설명** (선택)

카테고리를 먼저 추가한 뒤, 해당 카테고리에 링크를 추가하면 됩니다.
# Linkin
