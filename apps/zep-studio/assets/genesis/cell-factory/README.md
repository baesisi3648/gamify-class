# 리보솜 공장 오브젝트 세트

## 구성

- `ribosome-epa-assembly-station.png`: E·P·A 작업 베이
- `trna-amino-acid-carrier.png`: 아미노산을 운반하는 tRNA 로봇
- `ribosome-robot-arm.png`: tRNA 고정 및 펩타이드 결합 작업용 로봇팔
- `ribosome-conveyor-straight.png`: 직선 이송 레일
- `ribosome-conveyor-curve.png`: 90도 곡선 이송 레일
- `amino-acid-cargo-pod.png`: 움직이는 아미노산 화물
- `ribosome-conveyor-example.js`: ZEP Script 이동 예제
- `zep-ribosome-factory-upload.zip`: ZEP에 바로 올리는 자동 생산 라인 앱
- `zep-app/INSTALL.md`: 업로드와 좌표 변경 안내

모든 PNG는 투명 배경입니다.

## 권장 배치

1. 레일을 A 자리로 들어오는 반입선과 E 자리에서 빠져나가는 배출선으로 나눕니다.
2. E·P·A 스테이션은 왼쪽부터 E(청록), P(주황), A(자홍) 순서로 놓습니다.
3. A 자리에는 아미노산 화물 포드와 tRNA 운반 로봇을 배치합니다.
4. P 자리에는 로봇팔을 1~2개 배치해 펩타이드 사슬 전달 작업을 표현합니다.
5. E 자리에는 화물이 없는 tRNA 운반 로봇이 배출되는 동선을 만듭니다.

## 움직임 구현

레일 PNG 자체는 고정 배경 오브젝트입니다. 움직임이 필요한 tRNA 운반 로봇 또는 아미노산 화물 포드만 ZEP Script의 `Map.putObjectWithKey`와 `Map.moveObjectWithKey`로 이동시킵니다.

현재 PNG는 한 프레임의 정적 오브젝트입니다. 로봇팔 관절이나 컨베이어 롤러 자체를 반복 애니메이션하려면 프레임별 스프라이트 시트를 별도로 제작한 뒤 `Map.playObjectAnimationWithKey`를 사용합니다.

완성형 업로드 ZIP에는 리보솜 내부 애니메이션과 외부 포드 이동을 모두 포함했습니다.

